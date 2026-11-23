# Casos de prueba — Modificaciones al sistema de ranking y reputación
**Proyecto:** Regálalo, lo regalo  
**Referencia:** RFC-RANK-2026-01 a RFC-RANK-2026-04  
**Fecha:** 29 mayo 2026  
**Audiencia:** producto, QA, stakeholders no técnicos  

---

## Cómo leer este documento

Cada caso de prueba describe:
- **Situación de partida:** el estado del sistema o del usuario antes de que ocurra nada.
- **Acción:** lo que ocurre o lo que se ejecuta.
- **Resultado esperado:** lo que el sistema debe producir para que la prueba sea exitosa.

Los casos están agrupados por tema. Todos son pruebas de comportamiento real del sistema (no ejemplos hipotéticos): se crean los datos necesarios en una base de datos de prueba, se ejecuta la acción, y se verifica el resultado.

---

## Grupo 1 — Puntos por entrega completada

> Cubre qué puntaje recibe cada participante cuando el donante confirma que la entrega se realizó correctamente.

---

### CASO-01
**Primera donación de un donante**

**Situación de partida:**  
Un usuario nunca ha completado ninguna donación (su contador de donaciones es cero). Tiene un objeto publicado y ha seleccionado un receptor. La sesión de entrega está activa.

**Acción:**  
El donante confirma que la entrega se realizó.

**Resultado esperado:**  
- El donante gana **15 puntos** de reputación.
- El receptor gana **1 punto** de reputación.
- El contador de donaciones del donante pasa de 0 a 1.
- En el historial de eventos queda registrado el delta de 15 para el donante y el de 1 para el receptor, con sus roles identificados correctamente.

---

### CASO-02
**Donación de un donante con historial previo**

**Situación de partida:**  
Un usuario ya tiene al menos una donación completada anteriormente. Completa una nueva sesión de entrega.

**Acción:**  
El donante confirma que la entrega se realizó.

**Resultado esperado:**  
- El donante gana **10 puntos** (no 15; el bonus de primera donación no vuelve a aplicarse).
- El receptor gana **1 punto**.

---

### CASO-03
**El receptor siempre gana 1 punto, independientemente del historial del donante**

**Situación de partida:**  
Se completan dos entregas distintas: una con un donante primerizo (primera donación) y otra con un donante veterano (más de una donación previa). En ambos casos, el receptor es diferente.

**Acción:**  
Ambos donantes confirman sus entregas.

**Resultado esperado:**  
- En ambas entregas, el receptor recibe exactamente **1 punto**.
- El historial del sistema no muestra ningún receptor con un delta distinto de 1 por este tipo de evento.

---

### CASO-04
**La racha de no-shows se resetea al completar una entrega exitosa**

**Situación de partida:**  
Un receptor tiene 2 no-shows consecutivos registrados (su racha está en 2).

**Acción:**  
El mismo usuario participa ahora como receptor en una sesión nueva, y el donante confirma que la entrega se realizó correctamente.

**Resultado esperado:**  
- El receptor gana 1 punto.
- Su racha de no-shows vuelve a **0**.
- Si más adelante tiene un nuevo no-show, se penalizará como si fuera el primero (-10 puntos), no como continuación de la racha anterior.

---

### CASO-05
**El bonus de primera donación no se repite en una segunda donación del mismo usuario**

**Situación de partida:**  
Un usuario completa su primera donación y recibe 15 puntos. Días después, publica un nuevo objeto y completa otra entrega.

**Acción:**  
El donante confirma la segunda entrega.

**Resultado esperado:**  
- En la segunda entrega, el donante recibe **10 puntos** (no 15).
- El historial muestra claramente los dos eventos: el primero con delta 15 y el segundo con delta 10.

---

## Grupo 2 — Penalización por no-show

> Cubre qué ocurre cuando el donante declara que el receptor no se presentó o no completó la entrega.

---

### CASO-06
**Primer no-show del receptor**

**Situación de partida:**  
Un receptor no tiene ningún no-show previo en su historial (racha en 0).

**Acción:**  
El donante cancela la sesión y declara que el receptor no se presentó.

**Resultado esperado:**  
- El receptor pierde **10 puntos**.
- Su racha de no-shows pasa a **1**.
- El puntaje puede quedar en negativo si el receptor tenía menos de 10 puntos.

---

### CASO-07
**Segundo no-show consecutivo del receptor**

**Situación de partida:**  
El receptor ya tiene 1 no-show previo sin ninguna entrega exitosa entre medio (racha en 1).

**Acción:**  
Se produce un nuevo no-show en otra sesión.

**Resultado esperado:**  
- El receptor pierde **20 puntos** adicionales (no 10).
- Su racha de no-shows pasa a **2**.

---

### CASO-08
**Tercer no-show consecutivo del receptor**

**Situación de partida:**  
El receptor tiene una racha activa de 2 no-shows consecutivos.

**Acción:**  
Se produce un nuevo no-show.

**Resultado esperado:**  
- El receptor pierde **30 puntos** adicionales.
- Su racha de no-shows pasa a **3**.

---

### CASO-09
**Una entrega exitosa entre dos no-shows reinicia la racha**

**Situación de partida:**  
Un receptor tiene 2 no-shows consecutivos (racha en 2). Después participa en una entrega que se completa correctamente (racha vuelve a 0).

**Acción:**  
El mismo receptor vuelve a tener un no-show en una sesión posterior.

**Resultado esperado:**  
- El sistema trata este no-show como el **primero** de una nueva racha.
- La penalización es de **-10 puntos** (no -30 ni ningún valor heredado de la racha anterior).

---

### CASO-10
**Cancelación de sesión sin declarar no-show no penaliza al receptor**

**Situación de partida:**  
Existe una sesión de entrega activa.

**Acción:**  
El donante cancela la sesión sin marcar la opción de no-show (simplemente cancela el objeto o la sesión).

**Resultado esperado:**  
- La reputación del receptor **no cambia**.
- La racha de no-shows del receptor **no cambia**.
- El objeto vuelve al estado activo.

---

### CASO-11
**Sesión que expira por tiempo sin ninguna acción no penaliza a nadie**

**Situación de partida:**  
Una sesión de entrega lleva 7 días activa sin que el donante haya confirmado ni cancelado.

**Acción:**  
El sistema cierra la sesión automáticamente al vencer el plazo.

**Resultado esperado:**  
- La reputación del donante **no cambia**.
- La reputación del receptor **no cambia**.
- La racha de no-shows del receptor **no cambia**.
- El objeto vuelve al estado activo.

---

## Grupo 3 — Visibilidad en lista de candidatos (Tier 1 y Tier 2)

> Cubre quién aparece o no en la lista de personas que el donante puede elegir como receptor, según el historial de solicitudes y donaciones de cada usuario.

---

### CASO-12
**Usuario sin historial de solicitudes agotadas es visible normalmente**

**Situación de partida:**  
Un usuario nunca ha agotado su límite mensual de solicitudes (su contador de ciclos es 0) y no ha donado nada.

**Acción:**  
El usuario solicita un objeto. El donante consulta la lista de candidatos.

**Resultado esperado:**  
- El usuario **aparece** en la lista de candidatos.
- No hay ninguna penalización aplicada a su posición.

---

### CASO-13
**Usuario que agotó sus cupos en 1 ciclo sin donar nada: visible pero con posición penalizada (Tier 1)**

**Situación de partida:**  
Un usuario ha agotado sus 3 cupos de solicitud en al menos 1 período de 30 días y nunca ha completado ninguna donación. Solicita un nuevo objeto.

**Acción:**  
El donante consulta la lista de candidatos para ese objeto.

**Resultado esperado:**  
- El usuario **aparece** en la lista (no está oculto).
- Su posición en el listado está penalizada: aparece más abajo que otros candidatos con el mismo puntaje de reputación que no tienen esta penalización.

---

### CASO-14
**Usuario que agotó sus cupos en 2 ciclos sin donar nada: no visible (Tier 2)**

**Situación de partida:**  
Un usuario ha agotado sus 3 cupos de solicitud en al menos 2 períodos de 30 días consecutivos y nunca ha completado ninguna donación.

**Acción:**  
El usuario solicita un objeto. El donante consulta la lista de candidatos.

**Resultado esperado:**  
- El usuario **no aparece** en la lista de candidatos del donante.
- El donante no tiene ninguna forma de verlo ni seleccionarlo.

---

### CASO-15
**El contador de "cuántas personas han solicitado el objeto" refleja la misma exclusión**

**Situación de partida:**  
Un objeto tiene 4 solicitudes: 3 de usuarios normales y 1 de un usuario en Tier 2.

**Acción:**  
El donante consulta la pantalla de "Mis objetos".

**Resultado esperado:**  
- El contador de solicitudes muestra **3**, no 4.
- El número que ve el donante coincide exactamente con el número de candidatos que aparecen en la lista detallada.

---

### CASO-16
**Un usuario con muchos ciclos agotados pero que ha donado alguna vez no recibe penalización**

**Situación de partida:**  
Un usuario ha agotado sus cupos de solicitud en 5 ciclos consecutivos, pero tiene al menos 1 donación completada.

**Acción:**  
El usuario solicita un objeto. El donante consulta la lista de candidatos.

**Resultado esperado:**  
- El usuario **aparece** en la lista de candidatos sin ninguna penalización.
- Su posición refleja únicamente su puntaje de reputación y distancia geográfica.

---

### CASO-17
**Un usuario en Tier 2 que completa su primera donación se vuelve visible de inmediato**

**Situación de partida:**  
Un usuario está en Tier 2 (excluido del listado de candidatos). Publíca un objeto y completa una entrega como donante.

**Acción:**  
El donante confirma la entrega. Inmediatamente después, otro donante consulta la lista de candidatos de un objeto que este usuario había solicitado.

**Resultado esperado:**  
- El usuario **ya aparece** en la lista de candidatos.
- No hay período de espera ni ciclo adicional necesario.
- El usuario recibe además **15 puntos** por su primera donación.

---

### CASO-18
**Un usuario en Tier 1 que completa su primera donación deja de estar penalizado en el ranking**

**Situación de partida:**  
Un usuario está en Tier 1 (aparece pero con penalización de posición). Completa una donación.

**Acción:**  
Un donante consulta la lista de candidatos de un objeto que este usuario había solicitado.

**Resultado esperado:**  
- El usuario aparece en la lista **sin penalización de posición**.
- Su lugar en la lista refleja únicamente su puntaje de reputación real y distancia.

---

### CASO-19
**La regla de usuario pasivo (sin actividad, nunca ha donado) sigue funcionando de forma independiente**

**Situación de partida:**  
Un usuario nunca ha donado nada, ha recibido al menos 1 objeto, y lleva más de 60 días sin iniciar sesión en la aplicación. Su contador de ciclos agotados es 0 (no es Tier 2).

**Acción:**  
Otro donante consulta la lista de candidatos de un objeto que este usuario había solicitado hace tiempo.

**Resultado esperado:**  
- El usuario **no aparece** en la lista de candidatos.
- La exclusión se aplica por la regla de usuario pasivo, no por Tier 2.

---

## Grupo 4 — Combinaciones e interacciones entre reglas

> Cubre situaciones donde más de una regla entra en juego simultáneamente.

---

### CASO-20
**Un usuario en Tier 2 recibe el bonus de primera donación al mismo tiempo que recupera visibilidad**

**Situación de partida:**  
Un usuario está en Tier 2 (2 ciclos agotados, 0 donaciones). Publica un objeto, un receptor lo solicita, y la entrega se completa.

**Acción:**  
El donante confirma la entrega.

**Resultado esperado:**  
- El donante recibe **15 puntos** (bonus de primera donación).
- Su contador de donaciones pasa a 1.
- A partir de ese momento, deja de estar excluido del listado de candidatos en otros objetos donde haya solicitado (Tier 2 ya no se cumple).
- Los tres efectos ocurren como resultado de la misma acción.

---

### CASO-21
**El puntaje del receptor es siempre 1, sin importar si el donante está en Tier 1, Tier 2, o es primerizo**

**Situación de partida:**  
Se completan tres entregas con donantes en situaciones distintas: un donante en Tier 1 que completa su primera donación, un donante con historial normal, y un donante primerizo sin ciclos agotados.

**Acción:**  
Los tres donantes confirman sus entregas.

**Resultado esperado:**  
- En los tres casos, el receptor correspondiente recibe exactamente **1 punto**.
- La situación del donante no influye en los puntos del receptor.

---

### CASO-22
**El historial de reputación registra exactamente dos eventos por cada entrega completada**

**Situación de partida:**  
Se completa una entrega entre un donante y un receptor.

**Acción:**  
El donante confirma la entrega.

**Resultado esperado:**  
- En el historial de eventos del sistema quedan registradas exactamente **2 entradas** para esa sesión de entrega.
- Una entrada corresponde al donante (con su rol y su delta de puntos).
- La otra corresponde al receptor (con su rol y su delta de 1 punto).
- No hay entradas duplicadas ni entradas faltantes.

---

### CASO-23
**La perturbación aleatoria del ranking nunca hace que un usuario excluido aparezca en la lista**

**Situación de partida:**  
Un usuario está en Tier 2 y ha solicitado un objeto. El ranking aplica una variación aleatoria pequeña sobre los puntajes de cada candidato cada vez que se consulta la lista.

**Acción:**  
El donante consulta la lista de candidatos varias veces seguidas.

**Resultado esperado:**  
- El usuario Tier 2 **nunca aparece** en ninguna de las consultas.
- La variación aleatoria de posiciones entre los candidatos visibles no afecta la exclusión de los usuarios que deben estar ocultos.

---

### CASO-24
**Una racha larga de no-shows no impide la recuperación tras una donación exitosa**

**Situación de partida:**  
Un usuario acumula 3 no-shows consecutivos como receptor (racha en 3, puntaje muy negativo). Decide publicar un objeto y completar una donación como donante.

**Acción:**  
El donante confirma la entrega.

**Resultado esperado:**  
- Si es su primera donación: recibe **15 puntos**.
- Si ya había donado antes: recibe **10 puntos**.
- Su racha de no-shows como receptor vuelve a **0**.
- El siguiente no-show que eventualmente sufra como receptor volverá a penalizar solo **-10 puntos** (como si fuera el primero).

---

*Fin del catálogo — 24 casos*  
*Referencia técnica completa: RFC-RANK-2026-01 a RFC-RANK-2026-04 / ranking-spec-v1.0.md*
