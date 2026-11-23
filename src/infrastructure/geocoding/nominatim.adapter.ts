import { LRUCache } from 'lru-cache';
import { env } from '../../config/env';
import { IGeocodingService, GeocodingResult } from '../../application/services/geocoding.service';
import { GeocodingException } from '../../domain/exceptions/geocoding.exception';

const GEO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
};

export class NominatimAdapter implements IGeocodingService {
  private readonly cache = new LRUCache<string, GeocodingResult>({
    max: 500,
    ttl: GEO_CACHE_TTL_MS,
  });

  async geocode(postalCode: string, country = 'es'): Promise<GeocodingResult | null> {
    const key = `${country}:${postalCode}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const search = async (c?: string): Promise<GeocodingResult | null> => {
      const params = new URLSearchParams({
        postalcode: postalCode,
        format: 'json',
        limit: '1',
        addressdetails: '1',
        ...(c ? { country: c } : {}),
      });
      const url = `${env.NOMINATIM_BASE_URL}/search?${params.toString()}`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'Regalalo/1.0' },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) throw new GeocodingException('Error al conectar con el servicio de geocodificación');

      const data = await res.json() as NominatimResult[];

      if (!Array.isArray(data) || !data.length) return null;

      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);

      if (!isFinite(lat) || !isFinite(lon)) return null;

      const addr = data[0].address;
      const locationName =
        addr?.city ??
        addr?.town ??
        addr?.village ??
        addr?.municipality ??
        addr?.county ??
        data[0].display_name?.split(',')[0]?.trim();

      return { lat, lon, locationName };
    };

    let result = await search(country);

    // Fallback: búsqueda global si el filtro de país no devuelve resultado
    if (!result) {
      result = await search();
    }

    if (result) {
      this.cache.set(key, result);
    }
    return result;
  }
}
