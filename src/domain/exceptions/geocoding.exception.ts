export class GeocodingException extends Error {
  constructor(message = 'Geocoding failed') {
    super(message);
    this.name = 'GeocodingException';
  }
}
