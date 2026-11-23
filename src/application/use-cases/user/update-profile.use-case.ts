import { IUserRepository } from '../../../domain/repositories/user.repository';
import { UnauthorizedException } from '../../../domain/exceptions/unauthorized.exception';
import { GeocodingException } from '../../../domain/exceptions/geocoding.exception';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { IGeocodingService } from '../../services/geocoding.service';
import { extractStoragePathFromPublicUrl } from '../../../infrastructure/storage/extract-storage-path';
import {
  UpdateProfileRequestDto,
  UpdateProfileResponseDto,
} from '../../dtos/update-profile.dto';

export class UpdateProfileUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly geocodingService: IGeocodingService,
  ) {}

  async execute(userId: string, dto: UpdateProfileRequestDto): Promise<UpdateProfileResponseDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new UnauthorizedException();

    let lat: number | undefined;
    let lon: number | undefined;
    let locationName: string | undefined;
    let incrementJwtVersion = false;

    if (dto.avatarUrl) {
      const storagePath = extractStoragePathFromPublicUrl(dto.avatarUrl);
      if (storagePath && !storagePath.startsWith(`avatars/${userId}/`)) {
        throw new ForbiddenException();
      }
    }

    if (dto.postalCode !== undefined) {
      const coords = await this.geocodingService.geocode(dto.postalCode);
      if (!coords) {
        throw new GeocodingException('Código postal no válido o no encontrado');
      }
      lat = coords.lat;
      lon = coords.lon;
      locationName = coords.locationName;
      incrementJwtVersion = true;
    }

    const updated = await this.userRepo.updateProfile({
      userId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      avatarUrl: dto.avatarUrl,
      phone: dto.phone,
      postalCode: dto.postalCode,
      locationName,
      lat,
      lon,
      preferredLanguage: dto.preferredLanguage,
      incrementJwtVersion,
      previousAvatarUrl: user.avatarUrl,
    });

    return {
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      avatarUrl: updated.avatarUrl,
      phone: updated.phone,
      postalCode: updated.postalCode,
      locationName: updated.locationName,
      preferredLanguage: updated.preferredLanguage,
    };
  }
}
