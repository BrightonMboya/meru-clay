import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENT } from '@axiomhq/logging';
import { log, withAxiom } from '@/lib/log';

afterEach(() => vi.restoreAllMocks());

function spy() {
  return {
    log: vi.spyOn(log, 'log').mockImplementation(() => {}),
    error: vi.spyOn(log, 'error').mockImplementation(() => {}),
    flush: vi.spyOn(log, 'flush').mockResolvedValue(),
  };
}

const req = () => new Request('http://meruclay.test/api/join', { method: 'POST' });
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('withAxiom', () => {
  it.each([
    [200, 'info'],
    [201, 'info'],
    [400, 'warn'],
    [409, 'warn'],
    [500, 'error'],
    [502, 'error'],
  ])('logs a %i at %s, with the path, and flushes', async (status, level) => {
    const s = spy();
    const res = await withAxiom(async (_r: Request) => new Response('x', { status }))(req());
    await settle();

    expect(res.status).toBe(status);
    expect(s.log).toHaveBeenCalledTimes(1);
    const [lvl, message, report] = s.log.mock.calls[0];
    expect(lvl).toBe(level);
    expect(message).toMatch(new RegExp(`^POST /api/join ${status} in \\d+ms$`));
    // Request details ride on the EVENT symbol, so they land at the root of
    // the Axiom event as `request.*` rather than under `fields`.
    expect((report as Record<symbol, { request: Record<string, unknown> }>)[EVENT].request).toMatchObject({
      path: '/api/join',
      method: 'POST',
      statusCode: status,
    });
    expect(s.flush).toHaveBeenCalled();
  });

  it('logs a thrown error and still throws it', async () => {
    const s = spy();
    const boom = new Error('database went away');
    await expect(withAxiom(async (_r: Request) => Promise.reject(boom))(req())).rejects.toBe(boom);
    await settle();

    expect(s.error).toHaveBeenCalledTimes(1);
    expect(s.error.mock.calls[0][1]).toMatchObject({ error: 'database went away' });
    const report = s.error.mock.calls[0][1] as Record<symbol, { request: { statusCode: number } }>;
    expect(report[EVENT].request.statusCode).toBe(500);
    expect(s.flush).toHaveBeenCalled();
  });

  it('passes the route context through untouched', async () => {
    spy();
    const handler = vi.fn(async (_r: Request, ctx: { params: Promise<{ id: string }> }) =>
      Response.json(await ctx.params),
    );
    const res = await withAxiom(handler)(req(), { params: Promise.resolve({ id: 'abc' }) });
    expect(await res.json()).toEqual({ id: 'abc' });
  });
});
