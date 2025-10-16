import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin as supabase } from '../../lib/supabaseAdmin';

type RowIn = {
  name: string;
  type?: 'fixed' | 'custom';
  enabled?: boolean;
};

type ExtensionRow = {
  id: number;
  name: string;
  type: 'fixed' | 'custom';
  enabled: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  try {
    if (method === 'GET') {
      const { data, error } = await supabase
        .from('extensions')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (method === 'POST') {
      const body = req.body as RowIn | RowIn[];
      const items: RowIn[] = Array.isArray(body) ? body : [body];

      // 정규화
      const normalized = items
        .map((it) => ({
          name: (it.name ?? '').trim().replace(/^\./, '').toLowerCase(),
          type: (it.type ?? 'custom') as 'fixed' | 'custom',
          enabled: typeof it.enabled === 'boolean' ? it.enabled : (it.type ?? 'custom') === 'custom' ? true : false,
        }))
        .filter((it) => it.name.length > 0);

      if (normalized.length === 0) {
        return res.status(400).json({ error: '유효한 확장자가 없습니다.' });
      }

      // 중복 제거
      const dedupByInput: RowIn[] = [];
      const seenInput = new Set<string>();
      for (const it of normalized) {
        if (!seenInput.has(it.name)) {
          seenInput.add(it.name);
          dedupByInput.push(it);
        }
      }
      // 20자 제한 검증
      const tooLong = dedupByInput.filter((n) => n.name.length > 20).map((n) => n.name);
      if (tooLong.length > 0) {
        return res.status(400).json({ error: `20자 초과 확장자: ${tooLong.join(', ')}` });
      }

      // 영문/숫자만 허용
      const validPattern = /^[a-z0-9]+$/;
      const invalid = dedupByInput.filter((n) => !validPattern.test(n.name)).map((n) => n.name);
      if (invalid.length > 0) {
        return res.status(400).json({ error: `영문 소문자와 숫자만 허용됩니다: ${invalid.join(', ')}` });
      }

      // 목록 조회
      const { data: allRows, error: allErr } = await supabase
        .from('extensions')
        .select('id,name,type,enabled');
      if (allErr) throw allErr;

      const customs = (allRows ?? []).filter((r) => r.type === 'custom');
      const customNames = new Set(customs.map((c) => String(c.name).toLowerCase()));
      const customCount = customs.length;

      // 중복 커스텀 제외
      const dedupedCustoms: Array<Pick<ExtensionRow, 'name' | 'type' | 'enabled'>> = dedupByInput.filter(
        (n) => n.type === 'custom' && !customNames.has(n.name)
      ).map((n) => ({ name: n.name, type: 'custom', enabled: typeof n.enabled === 'boolean' ? n.enabled : true }));

      // 200개 제한 적용 (남은 슬롯만큼 자르기)
      const remain = Math.max(0, 200 - customCount);
      const toInsert = dedupedCustoms.slice(0, remain);

      if (toInsert.length === 0) {
        return res.status(409).json({ error: '더 이상 추가할 수 없습니다.' });
      }

      const { data: inserted, error: insErr } = await supabase
        .from('extensions')
        .insert(toInsert)
        .select();
      if (insErr) throw insErr;

      return res.status(201).json(inserted);
    }

    if (method === 'PUT') {
      const { id, enabled, name, type } = req.body as {
        id: number;
        enabled?: boolean;
        name?: string;
        type?: 'fixed' | 'custom';
      };

      const updateData: Partial<ExtensionRow> & { name?: string } = {};
      if (typeof enabled !== 'undefined') updateData.enabled = enabled;
      if (typeof name !== 'undefined') updateData.name = String(name).trim().replace(/^\./, '').toLowerCase();
      if (typeof type !== 'undefined') updateData.type = type;

      if (!id || Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: '업데이트할 id 또는 데이터가 없습니다.' });
      }

      const { data, error } = await supabase
        .from('extensions')
        .update(updateData)
        .eq('id', id)
        .select();
      if (error) throw error;
      return res.status(200).json(data?.[0]);
    }

    if (method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: '삭제할 id가 없습니다.' });

      const { error } = await supabase.from('extensions').delete().eq('id', id);
      if (error) throw error;
      return res.status(204).end();
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '서버 오류가 발생했습니다.';
    console.error('API error:', err);
    return res.status(500).json({ error: message });
  }
}
