export interface CancelDeliveryResponseDto {
  status: 'cancelled';
  noShowDeclared: boolean;
  completedAt: Date;
}
