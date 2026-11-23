import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';
import { escapeHtml } from './escape-html';
import { env } from '../../../config/env';

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function renderTplAdm002(variables: Record<string, string | number>, _language?: string): { subject: string; html: string } {
  const reportId = variables.reportId != null ? String(variables.reportId) : '';
  const reportedEntityType = variables.reportedEntityType != null ? String(variables.reportedEntityType) : '';
  const reason = variables.reason != null ? String(variables.reason) : '';
  const entitySnapshotTitle = variables.entitySnapshotTitle != null ? String(variables.entitySnapshotTitle) : '';
  const reporterFirstName = variables.reporterFirstName != null ? String(variables.reporterFirstName) : '';
  const createdAt = variables.createdAt != null ? String(variables.createdAt) : '';

  const adminPanelUrl = (
    variables.adminPanelBaseUrl ? String(variables.adminPanelBaseUrl) : env.ADMIN_CORS_ORIGIN
  ).replace(/\/$/, '');
  const reportUrl = `${adminPanelUrl}/reportes/${encodeURIComponent(reportId)}`;

  const bodyHtml =
    renderEmailParagraph('Se ha recibido un nuevo reporte en la plataforma.') +
    renderEmailParagraph(
      `<strong>ID del reporte:</strong> ${escapeHtml(reportId)}<br />` +
      `<strong>Enlace directo:</strong> <a href="${escapeHtml(reportUrl)}" style="color: inherit;">${escapeHtml(reportUrl)}</a>`,
    ) +
    renderEmailParagraph(
      `<strong>Tipo de entidad:</strong> ${escapeHtml(reportedEntityType)}<br />` +
      `<strong>Motivo:</strong> ${escapeHtml(reason)}`,
    ) +
    renderEmailParagraph(
      `<strong>Contenido reportado:</strong> ${escapeHtml(entitySnapshotTitle)}<br />` +
      `<strong>Denunciante:</strong> ${escapeHtml(reporterFirstName)}<br />` +
      `<strong>Fecha y hora:</strong> ${escapeHtml(formatDate(createdAt))}`,
    );

  const html = renderEmailLayout({
    preheader: 'Nuevo reporte recibido. Revisar en el panel de administración.',
    firstName: 'administrador',
    title: 'Nuevo reporte recibido',
    bodyHtml,
  });

  return {
    subject: `[Regálalo] Nuevo reporte — ${reason} — ${reportedEntityType}`,
    html,
  };
}
