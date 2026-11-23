import { renderTpl001 } from './tpl-001-welcome';
import { renderTpl002 } from './tpl-002-reset-password';
import { renderTpl003 } from './tpl-003-receiver-selected';
import { renderTpl004 } from './tpl-004-session-expired';
import { renderTpl005 } from './tpl-005-cancellation';
import { renderTpl006 } from './tpl-006-new-request';
import { renderTpl007 } from './tpl-007-degradation';
import { renderTpl008 } from './tpl-008-password-reset-done';
import { renderTpl009 } from './tpl-009-email-verification';
import { renderTpl010 } from './tpl-010-nearby-items-digest';
import { renderTplAdm001 } from './tpl-adm-001';
import { renderTpl011 } from './tpl-011-report-confirmation';
import { renderTpl012 } from './tpl-012-report-resolved';
import { renderTpl013 } from './tpl-013-warn-user';
import { renderTplAdm002 } from './tpl-adm-002-new-report-admin';

export type EmailTemplateRenderer = (
  variables: Record<string, string | number>,
  language?: string,
) => { subject: string; html: string };

/** Active transactional templates (TPL-001…TPL-013 + TPL-ADM-001…TPL-ADM-002). */
export const emailTemplateRegistry: Record<string, EmailTemplateRenderer> = {
  'TPL-001': renderTpl001,
  'TPL-002': renderTpl002,
  'TPL-003': renderTpl003,
  'TPL-004': renderTpl004,
  'TPL-005': renderTpl005,
  'TPL-006': renderTpl006,
  'TPL-007': renderTpl007,
  'TPL-008': renderTpl008,
  'TPL-009': renderTpl009,
  'TPL-010': renderTpl010,
  'TPL-ADM-001': renderTplAdm001,
  'TPL-011': renderTpl011,
  'TPL-012': renderTpl012,
  'TPL-013': renderTpl013,
  'TPL-ADM-002': renderTplAdm002,
};

export const ACTIVE_EMAIL_TEMPLATE_IDS = Object.keys(
  emailTemplateRegistry,
) as (keyof typeof emailTemplateRegistry)[];
