import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NominatimAdapter } from '../../src/infrastructure/geocoding/nominatim.adapter';
import { GeocodingException } from '../../src/domain/exceptions/geocoding.exception';

describe('NominatimAdapter — LRU Cache', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([{ lat: '40.4168', lon: '-3.7038' }]),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('miss — llama a Nominatim y guarda en caché', async () => {
    const adapter = new NominatimAdapter();
    const result = await adapter.geocode('28001');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ lat: 40.4168, lon: -3.7038 });
  });

  it('hit — mismo código postal no repite fetch', async () => {
    const adapter = new NominatimAdapter();
    await adapter.geocode('28001');
    await adapter.geocode('28001');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('claves distintas — un fetch por postalCode', async () => {
    const adapter = new NominatimAdapter();
    await adapter.geocode('28001');
    await adapter.geocode('08001');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('respuesta vacía de Nominatim — null sin excepción', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    });
    const adapter = new NominatimAdapter();
    const result = await adapter.geocode('00000');

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('error HTTP de Nominatim — GeocodingException', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const adapter = new NominatimAdapter();

    await expect(adapter.geocode('28001')).rejects.toBeInstanceOf(GeocodingException);
  });
});
