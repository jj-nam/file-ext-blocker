'use client';
import { useEffect, useState, useRef } from 'react';

type Extension = {
  id: number;
  name: string;
  type: 'fixed' | 'custom';
  enabled: boolean;
};

export default function Home() {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [newExt, setNewExt] = useState('');
  const [loading, setLoading] = useState(false);

  
  // 확장자 목록
  async function fetchExtensions() {
    const res = await fetch('/api/extensions');
    const data = await res.json();
    setExtensions(data);
  }

  useEffect(() => {
    fetchExtensions();
  }, []);

  // 체크박스 토글
  async function toggleEnabled(item: Extension) {
    const updated = extensions.map((ext) =>
      ext.id === item.id ? { ...ext, enabled: !ext.enabled } : ext
    );
    setExtensions(updated);

    await fetch('/api/extensions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, enabled: !item.enabled }),
    });
  }

  // 추가
  async function addExtension() {
    const rawInput = newExt.trim();
    if (!rawInput) return alert('확장자를 입력하세요.');

    // 쉼표로 분리, 다건 저장
    const parsed = rawInput
      .split(',')
      .map((n) => n.trim().replace(/^\./, '').toLowerCase())
      .filter((n) => n.length > 0);

    // 입력 받은 값 중복 제거
    const uniqueInInput: string[] = [];
    const seen = new Set<string>();
    for (const n of parsed) {
      if (!seen.has(n)) {
        seen.add(n);
        uniqueInInput.push(n);
      }
    }

    // 허용 패턴: 영문소문자+숫자만 (1~20자)
    const validPattern = /^[a-z0-9]+$/;

    // 20자 검증
    const tooLong = uniqueInInput.filter((n) => n.length > 20);
    if (tooLong.length > 0) {
      return alert(`다음 확장자는 20자를 초과했습니다: ${tooLong.join(', ')}`);
    }

    // 영문과 숫자만 입력 가능
    const invalid = uniqueInInput.filter((n) => !validPattern.test(n));
    if (invalid.length > 0) {
      return alert(`영문 소문자와 숫자만 입력 가능합니다 : ${invalid.join(', ')}`);
    }

    // 현재 목록
    const customList = extensions.filter((e) => e.type === 'custom');
    const fixedList = extensions.filter((e) => e.type === 'fixed');

    // 200개 제한
    const customCount = customList.length;
    if (customCount >= 200) {
      return alert('더 이상 추가할 수 없습니다.');
    }

    // 고정/커스텀 중복 판단
    const fixedToEnableIds: number[] = [];
    const existingCustomNames = new Set(customList.map((c) => c.name.toLowerCase()));
    const toInsert: string[] = [];

    for (const name of uniqueInInput) {
      // 커스텀에 존재 여부
      if (existingCustomNames.has(name)) continue;

      // 고정에 존재 여부
      const fx = fixedList.find((f) => f.name.toLowerCase() === name);
      if (fx) {
        fixedToEnableIds.push(fx.id);
        continue;
      }

      // 신규 커스텀 저장
      toInsert.push(name);
    }

    // 남은 슬롯만큼 제한
    const remain = Math.max(0, 200 - customCount);
    const toInsertLimited = toInsert.slice(0, remain);

    if (fixedToEnableIds.length === 0 && toInsertLimited.length === 0) {
    setNewExt('');
    if (customCount >= 200) {
      return alert('200개를 초과하여 추가할 수 없습니다.');
    }
    return alert('이미 존재하는 확장자입니다.');
  }

    setLoading(true);
    try {
      // 1) 고정 확장자 체크
      if (fixedToEnableIds.length > 0) {
        setExtensions((prev) =>
          prev.map((ext) =>
            fixedToEnableIds.includes(ext.id) ? { ...ext, enabled: true } : ext
          )
        );
        // 서버 반영
        await Promise.all(
          fixedToEnableIds.map((id) =>
            fetch('/api/extensions', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, enabled: true }),
            })
          )
        );
      }

      // 2) 커스텀 다건 insert
      if (toInsertLimited.length > 0) {
        const res = await fetch('/api/extensions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            toInsertLimited.map((name) => ({
              name,
              type: 'custom',
              enabled: true,
            }))
          ),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || '추가 중 오류가 발생했습니다.');
        }

        const added = await res.json();
        const addedArray = Array.isArray(added) ? added : [added];
        setExtensions((prev) => {
          const next = [...prev, ...addedArray];
          next.sort((a, b) => a.name.localeCompare(b.name));
          return next;
        });
      }

      setNewExt('');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '추가 중 오류가 발생했습니다.';
      alert(message);
    } finally {
      setLoading(false);
    }
  }

  // 삭제
  async function deleteExtension(id: number) {
    await fetch(`/api/extensions?id=${id}`, { method: 'DELETE' });
    setExtensions((prev) => prev.filter((ext) => ext.id !== id));
  }

  const bulkLoading = loading; // 필요시 별도 로딩 분리 가능
  const fixed = extensions.filter((e) => e.type === 'fixed');
  const custom = extensions
    .filter((e) => e.type === 'custom')
    .sort((a, b) => a.name.localeCompare(b.name));

    // 전체선택 체크 상태 계산
    const allFixedChecked = fixed.length > 0 && fixed.every((f) => f.enabled);

    // 고정 확장자 전체 토글
    async function toggleAllFixed(next: boolean) {
      // 즉시 UI 반영
      setExtensions((prev) =>
        prev.map((e) => (e.type === 'fixed' ? { ...e, enabled: next } : e))
      );

      // 서버 일괄 업데이트
      await fetch('/api/extensions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk: 'fixedToggleAll', enabled: next }),
      });
    }

    // 커스텀 확장자 전체 삭제
    async function clearAllCustom() {
      if (!confirm('모든 커스텀 확장자를 삭제할까요?')) return;

      // 즉시 UI 반영
      setExtensions((prev) => prev.filter((e) => e.type !== 'custom'));

      // 서버 일괄 삭제
      const res = await fetch('/api/extensions?all=custom', { method: 'DELETE' });
      if (!res.ok) {
        alert('삭제 중 오류가 발생했습니다.');
        // 실패 시 다시 목록 동기화
        fetchExtensions();
      }
    }

    // 입력창만 초기화
    function clearInput() {
      setNewExt('');
    }

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif' }}>
      <hr/><br/>
      <h1>파일 확장자 차단 설정</h1>
      <br/><hr/><br/>
      <h2>파일 확장자에 따라 특정 형식의 파일을 첨부하거나 전송하지 못하도록 제한</h2>
      <section style={{ marginTop: 20 }}>
        <table
        cellPadding={6}
        style={{
          borderCollapse: 'separate',
          borderSpacing: '0 8px',
          width: '80%',
        }}
      >
        <tbody>
          {/* 고정 확장자 */}
          <tr>
            <th style={{width: '120px', textAlign: 'left', padding: '10px', verticalAlign: 'top'}}>
              고정 확장자
              <input type="checkbox" checked={allFixedChecked} onChange={(e) => toggleAllFixed(e.target.checked)} style={{ marginLeft: 8, verticalAlign: 'middle' }}/>
            </th>
            <td colSpan={14}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 24px' }}>
                {fixed.map((f) => (
                      <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={f.enabled} onChange={() => toggleEnabled(f)}/>  
                        <span>{f.name}</span>
                      </label>
                    ))}
              </div>
            </td>
          </tr>

          {/* 커스텀 확장자 */}
          <tr>
            <th style={{ width: '120px', textAlign: 'left', padding: '10px' }}>
              커스텀 확장자
            </th>
            <td colSpan={14} style={{ padding: '0 10px 0 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input value={newExt} onChange={(e) => setNewExt(e.target.value)} placeholder="확장자 입력" maxLength={20} style={{ padding: '6px', minWidth: '280px' }} onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (!loading) addExtension();
                    }
                  }}
                />
                <button onClick={addExtension} disabled={loading} style={{ padding: '6px 12px', backgroundColor: '#989d999c', border: 'none', borderRadius: '6px', cursor: 'pointer'}}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = '#43a047')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = '#989d999c')
                  }
                  >
                    + 추가
                </button>
                <button onClick={clearInput} style={{ padding: '6px 12px', backgroundColor: '#d32f2f', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ef5350')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#d32f2f')}>
                  초기화
                </button>
              </div>
            </td>
          </tr>

          {/* 추가된 커스텀 확장자 */}
          <tr>
            <th></th>
            <td colSpan={14}>
              <div style={{ width: '87%', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 6, right: 8, fontSize: 12, color: '#888' }}>
                  {custom.length}/200
                </div>

                {/* 추가된 커스텀 확장자 */}
                <div style={{border: '1px solid #ccc', borderRadius: 6, height: 200, padding: 8, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8, position: 'relative'}}>
                  {
                    custom.map((c) => (
                      <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #ccc', borderRadius: 12, padding: '4px 8px', lineHeight: 1}} title={c.name}>
                        <span>{c.name}</span>
                        <button onClick={() => deleteExtension(c.id)} style={{marginLeft: 8, border: 'none', background: 'transparent', cursor: 'pointer'}} aria-label={`${c.name} 삭제`} title="삭제">
                          ✕
                        </button>
                      </span>
                    ))
                  }
                  {custom.length > 0 && (
                    <button onClick={clearAllCustom} style={{ position: 'absolute', right: 8, bottom: 8, backgroundColor: '#d32f2f', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: 14, display: 'flex',alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.2s ease'}}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ef5350')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#d32f2f')} 
                      title="모든 커스텀 확장자 삭제">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"  width="18" height="18" >
                        <path d="M9 3v1H4v2h16V4h-5V3H9zm2 5v10h2V8h-2zm-4 0v10h2V8H7zm8 0v10h2V8h-2z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      </section>
    </main>
  );
}
