export interface GeocodingResult {
  lat: number;
  lon: number;
  locationName: string;
}

export interface IGeocodingService {
  geocode(postalCode: string): Promise<GeocodingResult | null>;
}
