# Cómo contribuir a regalalo-backend

Gracias por tu interés en Regálalo. Este documento explica cómo
proponer cambios en el servidor. Al contribuir aceptas el [Código de
conducta](CODE_OF_CONDUCT.md) y licencias tu aportación bajo la misma
licencia del proyecto (GNU AGPL-3.0, en la variante que figure en
NOTICE y en las cabeceras SPDX: AGPL-3.0-or-later).

No hay CLA. Cada persona conserva el copyright de su aportación y la
certifica con el Developer Certificate of Origin (DCO) 1.1, más abajo.

La rama principal es `main`. Las solicitudes de incorporación
(pull requests) se abren contra `main`. No envíes trabajo
directamente a otras ramas.

## 1. Issues y solicitudes de incorporación

1. Busca primero si ya existe una [incidencia (issue)](../../issues)
   sobre el tema. Si no, ábrela y espera, si puedes, a que se comente
   antes de escribir mucho código.
2. Haz un fork o una rama a partir de `main`.
3. Haz commits pequeños y con mensajes claros, en español o en
   inglés, cada uno certificado con el DCO (`git commit -s`).
4. Abre una solicitud de incorporación (pull request) contra la rama
   principal. Describe el problema, la solución y cómo se ha
   comprobado. Enlaza la incidencia si existe.
5. Mantén la rama al día con la principal y atiende la revisión.

Las vulnerabilidades de seguridad no se informan por issues públicas.
Sigue [SECURITY.md](SECURITY.md).

## 2. Estilo, construcción y pruebas

Los comandos siguientes son los scripts reales de `package.json`
(versión 1.5.0, leídos en los repos actuales el 23 de noviembre de
2026). No hay script de linter ni de Prettier en
este repositorio.

Requisitos: Node.js y npm. Copia `.env.example` (o
`.env.e2e.example`, según el caso) a un fichero local que **no** se
suba al repositorio.

```bash
npm install
npm test              # vitest run — debe pasar antes de pedir revisión
npm run test:coverage # vitest run --coverage (opcional)
npm run build         # npm run openapi:generate && tsc
```

Para desarrollar en local: `npm run dev` (`tsx watch src/main.ts`).
`npm run test:watch` deja Vitest en modo continuo.

Otros scripts (`db:migrate`, `db:seed`, `db:backup`, `db:restore`,
`storage:backup`, `admin:create`, `e2e:db:*`, `dev:remote*`) tocan
bases de datos o servicios y no forman parte de la comprobación
habitual de una aportación. No los ejecutes contra entornos que no
sean tuyos. No incluyas volcados, credenciales ni resultados de
esas órdenes en la solicitud de incorporación.

## 3. Developer Certificate of Origin (DCO) 1.1

Cada commit debe llevar la línea:

```
Signed-off-by: Nombre Apellidos <tu@correo>
```

El nombre y el correo deben coincidir con los de la autora o el
autor del commit. Se añade sola con:

```bash
git commit -s -m "tipo: resumen del cambio"
```

Si se te olvidó en el último commit y aún no lo has enviado:

```bash
git commit --amend -s --no-edit
```

No reescribas commits que ya estén en la rama principal. El proyecto
no usa CLA: el `-s` es la certificación, no una cesión de derechos.

Texto oficial del DCO 1.1, sin modificar
(<https://developercertificate.org/>):

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off)
    is maintained indefinitely and may be redistributed consistent
    with this project or the open source license(s) involved.
```

Si has usado herramientas de asistencia por inteligencia artificial,
decláralo en la solicitud de incorporación y asegúrate de que puedes
certificar el DCO (en particular, que tienes derecho a aportar ese
código bajo la licencia del proyecto).

## 4. Qué no se acepta

- Secretos, tokens, contraseñas, claves privadas, URL de bases de
  datos con credenciales, ficheros `.env` (salvo los `.env.example`)
  o cualquier credencial real o de un entorno de despliegue.
- Datos personales de personas reales (nombres, correos, teléfonos,
  direcciones, documentos). Las cuatro direcciones `@gmail.com` que
  ya aparecen en maquetas de documentación de otros componentes son
  ficticias y se quedan; no añadas otras sin que quede claro en el
  propio fichero que son de ejemplo.
- Cambios de marca: no se aceptan pull requests que sustituyan el
  nombre «Regálalo», los nombres «No lo vendo» o «No lo vendo, lo
  regalo», el logotipo o el sistema de diseño oficiales, ni que
  pretendan presentar un fork como la instancia oficial. Véanse
  [TRADEMARK.md](TRADEMARK.md) y [NOTICE](NOTICE).
- Aportaciones sin `Signed-off-by`, o que no pasen `npm test` sin una
  justificación clara.

## 5. Cómo se reconoce a quien contribuye

- El historial de Git conserva la autoría de cada commit.
- Quien aporte de forma aceptada (no los bots ni los agentes
  automáticos) se añade a [CONTRIBUTORS.md](CONTRIBUTORS.md), con su
  nombre o el identificador que prefiera.
- El reconocimiento del autor original y creador, Eduardo Emanuel
  Cabral Petrucci, figura en [NOTICE](NOTICE).
- El proyecto puede adoptar más adelante el emoji bot
  [all-contributors](https://allcontributors.org/) como complemento,
  no como sustituto de CONTRIBUTORS.md ni del historial.

## 6. Licencia, marca y código de conducta

La licencia del código es la GNU AGPL-3.0 (véanse LICENSE, NOTICE y
CABECERA-COPYRIGHT.txt). Si publicas un servicio en red con una
versión modificada, la §13 te obliga a ofrecer el código fuente
correspondiente a quienes lo usen.

La marca y el diseño tienen reglas propias (TRADEMARK.md) y no van
incluidos en la AGPL.

Al participar aceptas el [Código de conducta](CODE_OF_CONDUCT.md).
Las incidencias de conducta se envían a ecabralpetrucci@gmail.com.
