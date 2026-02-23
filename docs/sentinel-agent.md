# 🛡️ Sentinel — Security Auditor Agent

> **Sentinel** es el agente de ciberseguridad de OpenWeave. Audita agentes de IA,
> código fuente, servidores MCP y APIs para detectar y remediar vulnerabilidades
> antes de que lleguen a producción.

---

## ¿Qué hace Sentinel?

Sentinel activa cuatro perspectivas especializadas de forma simultánea:

| Rol interno | Especialidad |
|---|---|
| 🕵️ **The Breaker** | Prompt Injection, Jailbreak, evasión de sandboxes |
| 🛡️ **The Hardener** | SSH, SSL/TLS, Docker hardening, puertos expuestos |
| 🔍 **The Code Auditor** | SQLi, RCE, Broken Auth en Tools y servidores MCP |
| 🩹 **The Remediator** | Análisis de reportes y redacción de parches |

---

## Requisitos previos

- **VS Code** con la extensión **GitHub Copilot** (v1.250+)
- Copilot Chat con soporte para **Agents Mode** (`.github/agents/`)
- Node.js ≥ 25.6.1 y pnpm ≥ 10 (para auditar el monorepo)

---

## Instalación

El agente ya está incluido en el repositorio en `.github/agents/cyber-security.md`.
No requiere instalación adicional. VS Code lo detecta automáticamente al abrir el
workspace.

Para verificar que está disponible:

1. Abre el panel de **Copilot Chat** (`Ctrl+Alt+I`)
2. Haz clic en el selector de agentes (ícono `@`)
3. Busca **Sentinel** en la lista

---

## Configuración

El agente se configura a través del frontmatter YAML de `.github/agents/cyber-security.md`.

### Variables disponibles

```yaml
name: Sentinel                          # Nombre visible en Copilot Chat
description: ...                        # Descripción que aparece en el selector
argument-hint: ...                      # Placeholder del campo de entrada
target: vscode                          # Entorno de ejecución (vscode | github)
disable-model-invocation: false         # true = solo orquestación, sin LLM directo
```

### Personalizar el umbral de auditoría

Puedes ajustar las instrucciones del sistema editando la sección
`## 🔄 PROTOCOLO DE AUDITORÍA Y REMEDIACIÓN` en el archivo del agente.
Por ejemplo, para añadir auditoría de dependencias npm:

```markdown
### 2. Análisis de Vulnerabilidades
...
- **Dependency Audit:** Ejecutar `pnpm audit` y clasificar por severidad
```

### Modificar las herramientas disponibles

El campo `tools:` en el frontmatter controla qué capacidades tiene el agente.
Añade o elimina herramientas según el contexto de auditoría:

```yaml
tools:
  - vscode/askQuestions      # Hacer preguntas al usuario
  - execute/runInTerminal    # Ejecutar comandos (pnpm audit, etc.)
  - read/readFile            # Leer archivos del workspace
  - edit/createFile          # Crear reportes en .sentinel_logs/
  - search/codebase          # Búsqueda semántica en el código
  - web/fetch                # Consultar CVEs y advisories externos
```

> **Nota de seguridad:** Evita exponer herramientas de escritura masiva
> (`edit/editFiles`) en entornos de producción. Prefiere modo solo-lectura
> para auditorías no-destructivas.

---

## Uso

### Iniciar una auditoría

En Copilot Chat, selecciona el agente **@Sentinel** e ingresa el objetivo:

```
@Sentinel audita el servidor MCP en packages/weave-link/src/mcp-server.ts
```

```
@Sentinel revisa el system prompt del agente en apps/agent-core/src/
```

```
@Sentinel analiza toda la carpeta packages/ en busca de dependencias vulnerables
```

### Flujo interno del agente

```
1. RECON       → Identifica superficie de ataque y archivos de configuración
2. ANÁLISIS    → Busca vulnerabilidades por categoría (Prompt / Infra / Code)
3. WEAVE TRACE → Persiste hallazgos en .sentinel_logs/
4. REPORTE     → Genera audit_summary.md con nivel de riesgo y plan de remediación
```

### Estructura de logs generada

Sentinel crea automáticamente la carpeta `.sentinel_logs/` en la raíz del proyecto:

```
.sentinel_logs/
├── audit_summary.md        # Resumen general: fecha, scope, risk level
├── VULN-001.md             # Detalle de cada vulnerabilidad encontrada
├── VULN-002.md
└── ...
```

Formato de cada `VULN-{ID}.md`:

```markdown
## 🚨 VULN-001: [Tipo de Vulnerabilidad]

**Risk Level:** CRITICAL | HIGH | MEDIUM | LOW
**File:** ruta/al/archivo.ts
**Type:** Prompt Injection / SQLi / RCE / Broken Auth / ...
**Impact:** Descripción del riesgo potencial.
**Status:** Detected | Investigating | Patched

### Technical Deep Dive
Análisis con referencias a líneas de código específicas.

### Remediation Plan
1. **Acción Inmediata:** ...
2. **Hardening:** ...

### Verification
Comando o test para validar que fue corregido.
```

---

## Handoffs disponibles

Una vez que Sentinel completa su reporte, puede transferir el trabajo a otro agente:

| Handoff | Descripción |
|---|---|
| **Apply Security Patches** | Implementa los fixes descritos en el reporte Sentinel |
| **Re-Scan Environment** | Verifica que las vulnerabilidades ya no estén presentes |

Para activar un handoff, haz clic en el botón correspondiente al final del reporte
de Sentinel en el panel de Copilot Chat.

---

## Ejemplo de sesión

```
@Sentinel audita el package weave-link para vulnerabilidades en el servidor HTTP

> 🔍 RECON — Identificando superficie de ataque...
> 📄 Leyendo packages/weave-link/src/mcp-server.ts
> 📄 Leyendo packages/weave-link/src/tools.ts
>
> 🚨 Security Audit: weave-link HTTP Transport
> Risk Level: MEDIUM
>
> Vulnerability Summary:
> - Type: Missing rate limiting on POST /tools/call
> - Impact: DoS por abuso de invocación de tools
> - Status: Detected
>
> Remediation Plan:
> 1. Acción Inmediata: Añadir middleware de rate limiting
> 2. Hardening: Configurar max payload size en HttpTransport
>
> 📁 Reporte guardado en .sentinel_logs/VULN-001.md
```

---

## Agregar Sentinel a CI/CD (avanzado)

Para auditorías automáticas en cada PR, puedes invocar Sentinel desde un workflow
de GitHub Actions mediante la GitHub Copilot API (requiere Copilot Enterprise):

```yaml
# .github/workflows/sentinel-audit.yml
name: Sentinel Security Audit
on:
  pull_request:
    paths:
      - 'packages/**'
      - 'apps/**'
      - '.github/agents/**'

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run pnpm audit
        run: pnpm audit --audit-level=high
```

> La integración completa con el agente Sentinel en CI requiere GitHub Copilot
> Enterprise con Actions support. El workflow anterior ejecuta `pnpm audit` como
> capa mínima de seguridad disponible para todos.

---

## Referencias

- [`.github/agents/cyber-security.md`](../.github/agents/cyber-security.md) — Definición del agente
- [GitHub Copilot Agent Docs](https://docs.github.com/en/copilot/using-github-copilot/using-copilot-coding-agent) — Documentación oficial de agents
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) — Referencia de vulnerabilidades para agentes IA
