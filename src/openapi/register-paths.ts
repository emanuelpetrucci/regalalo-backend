import './registry';
import { registry } from './registry';
import { errorSchema, validationErrorSchema, uuidParamSchema, requestIdParamSchema } from './schemas/common.schemas';
import {
  registerRequestSchema,
  loginRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  authResponseSchema,
  loginResponseSchema,
  messageResponseSchema,
  verifyEmailQuerySchema,
  emailNotVerifiedErrorSchema,
} from './schemas/auth.schemas';
import {
  listItemsQueryOpenApiSchema,
  publishItemMultipartSchema,
  pauseItemRequestSchema,
  selectReceiverRequestSchema,
  requestItemRequestSchema,
  listItemsResponseSchema,
  getItemResponseSchema,
  itemLookupParamSchema,
  publishItemResponseSchema,
  pauseItemResponseSchema,
  getRankedCandidatesResponseSchema,
  requestItemResponseSchema,
  selectReceiverResponseSchema,
  cancelItemResponseSchema,
} from './schemas/item.schemas';
import {
  listMyItemsQueryOpenApiSchema,
  listMyRequestsQueryOpenApiSchema,
  listMyDeliverySessionsQueryOpenApiSchema,
  privateProfileSchema,
  publicProfileSchema,
  reputationHistoryResponseSchema,
  myItemsResponseSchema,
  myRequestsResponseSchema,
  myDeliverySessionsResponseSchema,
  updateProfileRequestSchema,
  updateProfileResponseSchema,
} from './schemas/user.schemas';
import {
  cancelDeliveryRequestSchema,
  deliverySessionSchema,
  confirmDeliveryResponseSchema,
  cancelDeliveryResponseSchema,
} from './schemas/delivery.schemas';
import { nearbyItemsDigestResponseSchema } from './schemas/jobs.schemas';
import {
  createReportRequestSchema,
  createReportResponseSchema,
  adminReportListResponseSchema,
  adminReportDetailResponseSchema,
  adminResolveReportRequestSchema,
  adminResolveReportResponseSchema,
} from './schemas/report.schemas';
import {
  adminLoginRequestSchema,
  adminLoginResponseSchema,
  adminVerifyOtpRequestSchema,
  adminVerifyOtpResponseSchema,
  adminErrorSchema,
  adminUserListResponseSchema,
  adminUserDetailResponseSchema,
  adminSuspendResponseSchema,
  adminReactivateResponseSchema,
  adminForceVerificationResponseSchema,
  adminCorrectReputationRequestSchema,
  adminCorrectReputationResponseSchema,
  adminResetNoShowsResponseSchema,
  adminItemListResponseSchema,
  adminItemDetailResponseSchema,
  adminItemActionResponseSchema,
  adminSessionListResponseSchema,
  adminSessionDetailResponseSchema,
  adminMetricsResponseSchema,
  adminSystemHealthResponseSchema,
} from './schemas/admin.schemas';
import { z } from './registry';

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

const err400 = json(validationErrorSchema, 'Solicitud inválida');
const err401 = json(errorSchema, 'No autenticado');
const err403 = json(errorSchema, 'Prohibido');
const err404 = json(errorSchema, 'No encontrado');
const err410 = json(errorSchema, 'Objeto no disponible');
const err409 = json(errorSchema, 'Conflicto');
const err422 = json(errorSchema, 'Entidad no procesable');
const err500 = json(errorSchema, 'Error interno');

const secured = [{ bearerAuth: [] as string[] }];
const cronSecured = [{ cronSecret: [] as string[] }];

export function registerOpenApiPaths(): void {
  registry.registerPath({
    method: 'get',
    path: '/health',
    tags: ['Health'],
    summary: 'Health check',
    responses: {
      200: json(z.object({ status: z.literal('ok') }), 'Servicio operativo'),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/register',
    tags: ['Auth'],
    summary: 'Registrar usuario',
    request: { body: { content: { 'application/json': { schema: registerRequestSchema } } } },
    responses: {
      201: json(authResponseSchema, 'Usuario registrado'),
      400: err400,
      409: err409,
      422: err422,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/login',
    tags: ['Auth'],
    summary: 'Iniciar sesión',
    request: { body: { content: { 'application/json': { schema: loginRequestSchema } } } },
    responses: {
      200: json(loginResponseSchema, 'Sesión iniciada'),
      400: err400,
      401: err401,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/forgot-password',
    tags: ['Auth'],
    summary: 'Solicitar recuperación de contraseña',
    request: { body: { content: { 'application/json': { schema: forgotPasswordRequestSchema } } } },
    responses: {
      200: json(messageResponseSchema, 'Solicitud aceptada'),
      400: err400,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/reset-password',
    tags: ['Auth'],
    summary: 'Restablecer contraseña',
    request: { body: { content: { 'application/json': { schema: resetPasswordRequestSchema } } } },
    responses: {
      200: json(messageResponseSchema, 'Contraseña actualizada'),
      400: err400,
      404: err404,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/auth/verify-email',
    tags: ['Auth'],
    summary: 'Verificar email con token',
    request: { query: verifyEmailQuerySchema },
    responses: {
      200: json(messageResponseSchema, 'Email verificado'),
      400: err400,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/resend-verification',
    tags: ['Auth'],
    summary: 'Reenviar email de verificación',
    security: [...secured],
    responses: {
      200: json(messageResponseSchema, 'Email de verificación reenviado'),
      401: err401,
      409: err409,
      429: json(errorSchema, 'Cooldown activo — incluye header Retry-After en segundos'),
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/items',
    tags: ['Items'],
    summary: 'Listar objetos cercanos',
    security: [...secured],
    request: { query: listItemsQueryOpenApiSchema },
    responses: {
      200: json(listItemsResponseSchema, 'Listado paginado'),
      400: err400,
      401: err401,
      403: json(emailNotVerifiedErrorSchema, 'Email no verificado'),
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/items',
    tags: ['Items'],
    summary: 'Publicar objeto',
    security: [...secured],
    request: {
      body: {
        content: {
          'multipart/form-data': { schema: publishItemMultipartSchema },
        },
      },
    },
    responses: {
      201: json(publishItemResponseSchema, 'Objeto publicado'),
      400: err400,
      401: err401,
      403: json(emailNotVerifiedErrorSchema, 'Email no verificado'),
      422: err422,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/items/{id}',
    tags: ['Items'],
    summary: 'Detalle de objeto por UUID o slug',
    security: [...secured],
    request: { params: z.object({ id: itemLookupParamSchema }) },
    responses: {
      200: json(getItemResponseSchema, 'Detalle del objeto'),
      400: err400,
      401: err401,
      403: json(emailNotVerifiedErrorSchema, 'Email no verificado'),
      410: err410,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/items/{id}',
    tags: ['Items'],
    summary: 'Cancelar objeto',
    security: [...secured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(cancelItemResponseSchema, 'Objeto cancelado'),
      400: err400,
      401: err401,
      403: err403,
      404: err404,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/items/{id}/pause',
    tags: ['Items'],
    summary: 'Pausar o reanudar solicitudes',
    security: [...secured],
    request: {
      params: z.object({ id: uuidParamSchema }),
      body: { content: { 'application/json': { schema: pauseItemRequestSchema } } },
    },
    responses: {
      200: json(pauseItemResponseSchema, 'Estado de pausa actualizado'),
      400: err400,
      401: err401,
      403: err403,
      404: err404,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/items/{id}/requests',
    tags: ['Items'],
    summary: 'Candidatos rankeados para un objeto',
    security: [...secured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(getRankedCandidatesResponseSchema, 'Lista de candidatos'),
      400: err400,
      401: err401,
      403: err403,
      404: err404,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/items/{id}/requests',
    tags: ['Items'],
    summary: 'Solicitar un objeto',
    security: [...secured],
    request: {
      params: z.object({ id: uuidParamSchema }),
      body: { content: { 'application/json': { schema: requestItemRequestSchema } } },
    },
    responses: {
      201: json(requestItemResponseSchema, 'Solicitud creada'),
      400: err400,
      401: err401,
      403: err403,
      404: err404,
      409: err409,
      422: err422,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/items/{id}/requests/{requestId}/select',
    tags: ['Items'],
    summary: 'Seleccionar receptor',
    security: [...secured],
    request: {
      params: z.object({ id: uuidParamSchema, requestId: requestIdParamSchema }),
      body: { content: { 'application/json': { schema: selectReceiverRequestSchema } } },
    },
    responses: {
      200: json(selectReceiverResponseSchema, 'Receptor seleccionado'),
      400: err400,
      401: err401,
      403: err403,
      404: err404,
      409: err409,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/users/me',
    tags: ['Users'],
    summary: 'Perfil privado del usuario autenticado',
    security: [...secured],
    responses: {
      200: json(privateProfileSchema, 'Perfil privado'),
      401: err401,
      403: json(emailNotVerifiedErrorSchema, 'Email no verificado'),
      500: err500,
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/users/me',
    tags: ['Users'],
    summary: 'Actualizar perfil del usuario autenticado',
    security: [...secured],
    request: { body: { content: { 'application/json': { schema: updateProfileRequestSchema } } } },
    responses: {
      200: json(updateProfileResponseSchema, 'Perfil actualizado'),
      400: err400,
      401: err401,
      403: json(emailNotVerifiedErrorSchema, 'Email no verificado'),
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/users/me/reputation-history',
    tags: ['Users'],
    summary: 'Historial de reputación',
    security: [...secured],
    responses: {
      200: json(reputationHistoryResponseSchema, 'Eventos de reputación'),
      401: err401,
      403: json(emailNotVerifiedErrorSchema, 'Email no verificado'),
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/users/me/delivery-sessions',
    tags: ['Users'],
    summary: 'Mis sesiones de entrega',
    security: [...secured],
    request: { query: listMyDeliverySessionsQueryOpenApiSchema },
    responses: {
      200: json(myDeliverySessionsResponseSchema, 'Sesiones paginadas'),
      400: err400,
      401: err401,
      403: json(emailNotVerifiedErrorSchema, 'Email no verificado'),
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/users/me/items',
    tags: ['Users'],
    summary: 'Mis objetos publicados',
    security: [...secured],
    request: { query: listMyItemsQueryOpenApiSchema },
    responses: {
      200: json(myItemsResponseSchema, 'Objetos paginados'),
      400: err400,
      401: err401,
      403: json(emailNotVerifiedErrorSchema, 'Email no verificado'),
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/users/me/requests',
    tags: ['Users'],
    summary: 'Mis solicitudes a objetos',
    security: [...secured],
    request: { query: listMyRequestsQueryOpenApiSchema },
    responses: {
      200: json(myRequestsResponseSchema, 'Solicitudes paginadas'),
      400: err400,
      401: err401,
      403: json(emailNotVerifiedErrorSchema, 'Email no verificado'),
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/users/{id}',
    tags: ['Users'],
    summary: 'Perfil público de usuario',
    security: [...secured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(publicProfileSchema, 'Perfil público'),
      400: err400,
      401: err401,
      403: json(emailNotVerifiedErrorSchema, 'Email no verificado'),
      404: err404,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/delivery-sessions/{id}',
    tags: ['Delivery'],
    summary: 'Detalle de sesión de entrega',
    security: [...secured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(deliverySessionSchema, 'Sesión de entrega'),
      400: err400,
      401: err401,
      403: err403,
      404: err404,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/delivery-sessions/{id}/confirm',
    tags: ['Delivery'],
    summary: 'Confirmar entrega',
    security: [...secured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(confirmDeliveryResponseSchema, 'Entrega confirmada'),
      400: err400,
      401: err401,
      403: err403,
      404: err404,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/delivery-sessions/{id}/cancel',
    tags: ['Delivery'],
    summary: 'Cancelar sesión de entrega',
    security: [...secured],
    request: {
      params: z.object({ id: uuidParamSchema }),
      body: { content: { 'application/json': { schema: cancelDeliveryRequestSchema } } },
    },
    responses: {
      200: json(cancelDeliveryResponseSchema, 'Sesión cancelada'),
      400: err400,
      401: err401,
      403: err403,
      404: err404,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/reports',
    tags: ['Reports'],
    summary: 'Reportar un objeto o usuario',
    security: [...secured],
    request: { body: { content: { 'application/json': { schema: createReportRequestSchema } } } },
    responses: {
      201: json(createReportResponseSchema, 'Reporte enviado'),
      400: err400,
      401: err401,
      403: json(errorSchema, 'Email no verificado o acceso prohibido'),
      404: err404,
      409: err409,
      422: err422,
      429: json(errorSchema, 'Límite de reportes excedido'),
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/jobs/nearby-items-digest',
    tags: ['Jobs'],
    summary: 'Digest horario de objetos cercanos (cron externo)',
    description:
      'Invocable por cron-job.org cada hora. Agrupa objetos publicados en la última hora y envía un email TPL-010 por usuario elegible.',
    security: [...cronSecured],
    responses: {
      200: json(nearbyItemsDigestResponseSchema, 'Digest procesado'),
      401: json(errorSchema, 'Secreto de cron inválido o ausente'),
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/admin/auth/login',
    tags: ['Admin-Auth'],
    summary: 'Inicio de sesión administrador (paso 1: credenciales)',
    request: { body: { content: { 'application/json': { schema: adminLoginRequestSchema } } } },
    responses: {
      200: json(adminLoginResponseSchema, 'Código OTP enviado al email'),
      400: err400,
      401: json(adminErrorSchema, 'Credenciales inválidas'),
      429: json(errorSchema, 'Rate limit excedido'),
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/admin/auth/verify-otp',
    tags: ['Admin-Auth'],
    summary: 'Inicio de sesión administrador (paso 2: verificar OTP)',
    request: { body: { content: { 'application/json': { schema: adminVerifyOtpRequestSchema } } } },
    responses: {
      200: json(adminVerifyOtpResponseSchema, 'JWT admin emitido'),
      400: err400,
      401: json(adminErrorSchema, 'OTP inválido, expirado o máximo de intentos'),
      429: json(errorSchema, 'Rate limit excedido'),
      500: err500,
    },
  });

  const adminSecured = [{ bearerAuth: [] as string[] }];

  registry.registerPath({
    method: 'get',
    path: '/admin/users',
    tags: ['Admin-Users'],
    summary: 'Listar usuarios con filtros y paginación',
    security: [...adminSecured],
    request: {
      query: z.object({
        search: z.string().optional().openapi({ description: 'Filtro por email, nombre o apellido' }),
        status: z.enum(['active', 'suspended']).optional(),
        emailVerified: z.boolean().optional(),
        page: z.number().int().min(1).optional().openapi({ default: 1 }),
        limit: z.number().int().min(1).max(100).optional().openapi({ default: 20 }),
      }),
    },
    responses: {
      200: json(adminUserListResponseSchema, 'Lista de usuarios'),
      400: err400,
      401: err401,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/users/{id}',
    tags: ['Admin-Users'],
    summary: 'Detalle completo de un usuario',
    security: [...adminSecured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(adminUserDetailResponseSchema, 'Detalle del usuario'),
      400: err400,
      401: err401,
      404: err404,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/admin/users/{id}/suspend',
    tags: ['Admin-Users'],
    summary: 'Suspender usuario (cascada atómica)',
    security: [...adminSecured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(adminSuspendResponseSchema, 'Usuario suspendido'),
      400: err400,
      401: err401,
      404: err404,
      409: err409,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/admin/users/{id}/reactivate',
    tags: ['Admin-Users'],
    summary: 'Reactivar usuario suspendido',
    security: [...adminSecured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(adminReactivateResponseSchema, 'Usuario reactivado'),
      400: err400,
      401: err401,
      404: err404,
      409: err409,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/admin/users/{id}/force-verification',
    tags: ['Admin-Users'],
    summary: 'Forzar envío de email de verificación',
    security: [...adminSecured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(adminForceVerificationResponseSchema, 'Email de verificación enviado'),
      400: err400,
      401: err401,
      404: err404,
      409: err409,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/admin/users/{id}/correct-reputation',
    tags: ['Admin-Users'],
    summary: 'Corregir reputación de un usuario',
    security: [...adminSecured],
    request: {
      params: z.object({ id: uuidParamSchema }),
      body: {
        content: { 'application/json': { schema: adminCorrectReputationRequestSchema } },
      },
    },
    responses: {
      200: json(adminCorrectReputationResponseSchema, 'Reputación corregida'),
      400: err400,
      401: err401,
      404: err404,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/admin/users/{id}/reset-no-shows',
    tags: ['Admin-Users'],
    summary: 'Resetear contador de no-shows',
    security: [...adminSecured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(adminResetNoShowsResponseSchema, 'Contador reseteado'),
      400: err400,
      401: err401,
      404: err404,
      409: err409,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/items',
    tags: ['Admin-Items'],
    summary: 'Listar objetos con filtros y paginación',
    security: [...adminSecured],
    request: {
      query: z.object({
        search: z.string().optional().openapi({ description: 'Filtro por título o descripción' }),
        status: z.enum(['active', 'reserved', 'completed', 'cancelled']).optional(),
        category: z.enum(['furniture', 'electronics', 'clothing', 'books', 'toys', 'kitchen', 'sports', 'tools', 'other']).optional(),
        degraded: z.boolean().optional().openapi({ description: 'Filtrar solo objetos degradados' }),
        donorId: z.string().uuid().optional(),
        page: z.number().int().min(1).optional().openapi({ default: 1 }),
        limit: z.number().int().min(1).max(100).optional().openapi({ default: 20 }),
      }),
    },
    responses: {
      200: json(adminItemListResponseSchema, 'Lista de objetos'),
      400: err400,
      401: err401,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/items/{id}',
    tags: ['Admin-Items'],
    summary: 'Detalle completo de un objeto',
    security: [...adminSecured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(adminItemDetailResponseSchema, 'Detalle del objeto'),
      400: err400,
      401: err401,
      404: err404,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/admin/items/{id}/cancel',
    tags: ['Admin-Items'],
    summary: 'Cancelar objeto (transacción atómica)',
    security: [...adminSecured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(adminItemActionResponseSchema, 'Objeto cancelado'),
      400: err400,
      401: err401,
      404: err404,
      409: err409,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/admin/items/{id}/reactivate',
    tags: ['Admin-Items'],
    summary: 'Reactivar objeto cancelado',
    security: [...adminSecured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(adminItemActionResponseSchema, 'Objeto reactivado'),
      400: err400,
      401: err401,
      404: err404,
      409: err409,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/sessions',
    tags: ['Admin-Sessions'],
    summary: 'Listar sesiones de entrega con filtros y paginación',
    security: [...adminSecured],
    request: {
      query: z.object({
        status: z.enum(['active', 'completed', 'cancelled', 'expired']).optional(),
        overdue: z.boolean().optional().openapi({ description: 'Solo sesiones active vencidas (deadline_at < NOW())' }),
        userId: z.string().uuid().optional().openapi({ description: 'Sesiones donde el usuario participa como donor o receiver' }),
        page: z.number().int().min(1).optional().openapi({ default: 1 }),
        limit: z.number().int().min(1).max(100).optional().openapi({ default: 20 }),
      }),
    },
    responses: {
      200: json(adminSessionListResponseSchema, 'Lista de sesiones'),
      400: err400,
      401: err401,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/sessions/{id}',
    tags: ['Admin-Sessions'],
    summary: 'Detalle de sesión (con canal de contacto y auditoría)',
    security: [...adminSecured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(adminSessionDetailResponseSchema, 'Detalle de la sesión'),
      400: err400,
      401: err401,
      404: err404,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/admin/sessions/{id}/force-expire',
    tags: ['Admin-Sessions'],
    summary: 'Forzar expiración de sesión activa atascada',
    security: [...adminSecured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(adminItemActionResponseSchema, 'Sesión expirada y objeto reactivado'),
      400: err400,
      401: err401,
      404: err404,
      409: err409,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/reports',
    tags: ['Admin-Reports'],
    summary: 'Listar reportes (cola de moderación) con filtros y paginación',
    security: [...adminSecured],
    request: {
      query: z.object({
        status: z.enum(['pending', 'resolved', 'archived']).optional().openapi({ default: 'pending' }),
        reportedEntityType: z.enum(['item', 'user']).optional(),
        reason: z.enum([
          'contenido_inadecuado',
          'fraude_o_enganio',
          'spam',
          'objeto_ilegal',
          'objeto_peligroso',
          'información_falsa',
          'comportamiento_abusivo',
          'otro',
        ]).optional(),
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
        page: z.number().int().min(1).optional().openapi({ default: 1 }),
        limit: z.number().int().min(1).max(100).optional().openapi({ default: 20 }),
      }),
    },
    responses: {
      200: json(adminReportListResponseSchema, 'Lista de reportes'),
      400: err400,
      401: err401,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/reports/{id}',
    tags: ['Admin-Reports'],
    summary: 'Detalle de reporte (con estado actual de la entidad y auditoría)',
    security: [...adminSecured],
    request: { params: z.object({ id: uuidParamSchema }) },
    responses: {
      200: json(adminReportDetailResponseSchema, 'Detalle del reporte'),
      400: err400,
      401: err401,
      404: err404,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/admin/reports/{id}/resolve',
    tags: ['Admin-Reports'],
    summary: 'Cerrar reporte con acción de resolución y nota obligatoria',
    security: [...adminSecured],
    request: {
      params: z.object({ id: uuidParamSchema }),
      body: { content: { 'application/json': { schema: adminResolveReportRequestSchema } } },
    },
    responses: {
      200: json(adminResolveReportResponseSchema, 'Reporte cerrado'),
      400: err400,
      401: err401,
      404: err404,
      409: err409,
      422: err422,
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/metrics',
    tags: ['Admin-Metrics'],
    summary: 'Dashboard de métricas operativas del ecosistema',
    security: [...adminSecured],
    responses: {
      200: json(adminMetricsResponseSchema, 'Métricas operativas'),
      401: json(adminErrorSchema, 'No autenticado'),
      500: err500,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/system/health',
    tags: ['Admin-System'],
    summary: 'Estado del sistema: jobs, alertas, storage, base de datos y configuración',
    security: [...adminSecured],
    responses: {
      200: json(adminSystemHealthResponseSchema, 'Estado del sistema'),
      401: json(adminErrorSchema, 'No autenticado'),
      500: err500,
    },
  });
}
