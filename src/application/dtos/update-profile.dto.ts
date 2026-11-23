export type PreferredLanguageDto = 'es' | 'ca' | 'en';

export interface UpdateProfileRequestDto {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string | null;
  phone?: string | null;
  postalCode?: string;
  preferredLanguage?: PreferredLanguageDto;
}

export interface UpdateProfileResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  phone: string | null;
  postalCode: string;
  locationName: string | null;
  preferredLanguage: string;
}
