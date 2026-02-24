# OpenWeave — VS Code Extension

> **M25** · Visualiza y gestiona tu grafo de conocimiento ([WeaveGraph](../../packages/weave-graph)) directamente desde VS Code, con sidebar interactivo, árbol de milestones, y participante de Copilot Chat `@openweave`.

---

## Requisitos

| Requisito | Versión mínima |
|---|---|
| VS Code | 1.99.0 |
| Node.js | 18+ |
| pnpm | 9+ |
| [weave-link](../../packages/weave-link) corriendo | cualquiera |
| GitHub Copilot Chat *(opcional)* | última versión |

La extensión se activa automáticamente en cualquier workspace que contenga una carpeta `.weave/`.

---

## Instalación y desarrollo

### 1. Instalar dependencias

Desde el **root del monorepo**:

```bash
pnpm install
```

### 2. Compilar la extensión

```bash
# Una sola vez
pnpm --filter @openweave/weave-vscode run compile

# O en modo watch (recompila en cada cambio)
pnpm --filter @openweave/weave-vscode run watch
```

También puedes usar el atajo de VS Code desde el root:

```
Ctrl+Shift+B  →  compile weave-vscode
```

### 3. Lanzar el Extension Host

```
F5  →  "Run Extension (weave-vscode)"
```

Se abre una **nueva ventana de VS Code** con la extensión activa y el icono ⬡ en la Activity Bar.

---

## Primer uso

### Conectar a WeaveLink

La extensión se comunica con el servidor HTTP de **weave-link** (por defecto `http://localhost:3000`).

**Opción A — Iniciar el servidor automáticamente:**

```
Ctrl+Shift+P  →  OpenWeave: Start WeaveLink Server
```

Abre un terminal integrado con `npx weave-link start`.

**Opción B — Conectar a un servidor ya corriendo:**

```
Ctrl+Shift+P  →  OpenWeave: Connect Server
```

Se te pedirá:
1. **URL del servidor** (default: `http://localhost:3000`)
2. **API Key** (dejar vacío si la autenticación está desactivada)

La configuración se guarda en `.vscode/settings.json` del workspace.

---

## Sidebar

Haz clic en el icono **⬡** en la Activity Bar para abrir el panel OpenWeave con tres vistas:

### Knowledge Graph

Grafo de fuerza dirigido (D3 v7) con todos los nodos y aristas del grafo de conocimiento.

- **Zoom:** rueda del ratón
- **Pan:** arrastrar el fondo
- **Mover nodo:** arrastrar el nodo
- **Clic en nodo:** abre el detalle del nodo en un panel lateral

### Milestones

Árbol de dos niveles con los hitos del proyecto y sus subtareas.

| Icono | Estado |
|---|---|
| ✅ | `completed` |
| 🔄 | `in-progress` |
| 🚫 | `blocked` |
| ⭕ | `not-started` |

### Sessions

Lista las sesiones activas en WeaveLink con proveedor, número de nodos y fecha de inicio.

---

## Comandos

Accede mediante `Ctrl+Shift+P`:

| Comando | Descripción |
|---|---|
| `OpenWeave: Init Project` | Registra el workspace actual como nodo `project` en el grafo |
| `OpenWeave: Query Graph` | Busca nodos por texto — muestra resultados en QuickPick con panel de detalle |
| `OpenWeave: Save Node` | Flujo guiado en 3 pasos: label → tipo → descripción |
| `OpenWeave: Connect Server` | Cambia URL / API Key y reconecta |
| `OpenWeave: Refresh` | Recarga sidebar (milestones + sessions) |
| `OpenWeave: Start WeaveLink Server` | Lanza `weave-link` en un terminal integrado |
| `OpenWeave: Stop WeaveLink Server` | Detiene el terminal de weave-link |

---

## Copilot Chat — `@openweave`

> Requiere la extensión **GitHub Copilot Chat**. Si no está instalada, los comandos de sidebar siguen funcionando con normalidad.

Abre el chat de Copilot (`Ctrl+Alt+I`) y usa el participante `@openweave`:

### Slash commands

```
@openweave /query <texto>       Busca nodos en el grafo
@openweave /save <descripción>  Crea un nodo desde lenguaje natural
@openweave /milestones          Muestra el estado del roadmap
@openweave /sessions            Lista las sesiones activas
@openweave /status              Estado de conexión con WeaveLink
```

### Ejemplos

```
@openweave /query authentication flow
@openweave /save el botón de login falla en mobile con error 401
@openweave /milestones
@openweave /status
```

### Lenguaje natural (EN / ES)

Puedes omitir el slash command y escribir directamente:

```
@openweave busca todos los nodos de tipo task
@openweave guarda un nodo sobre el bug de pagos
@openweave muéstrame los milestones de fase 2
@openweave show all concept nodes related to auth
```

### Cómo funciona `/save` con IA

El comando `/save` envía tu mensaje al **modelo activo de Copilot** para extraer automáticamente `{label, type, description}` y guarda el nodo sin que tengas que rellenar formularios. Si la extracción falla, te redirige al flujo guiado de la paleta de comandos.

---

## Barra de estado

En la esquina inferior derecha aparece el indicador de conexión:

| Estado | Indicador |
|---|---|
| Conectado (42 nodos) | `⊕ Weave · 42n` |
| Conectando… | `⟳ Weave…` |
| Desconectado | `⊘ Weave` |
| Error | `⊗ Weave` (fondo rojo) |

Haz clic en el indicador para abrir `OpenWeave: Connect Server`.

---

## Configuración

| Setting | Tipo | Default | Descripción |
|---|---|---|---|
| `openweave.serverUrl` | `string` | `http://localhost:3000` | URL del servidor WeaveLink |
| `openweave.apiKey` | `string` | `""` | Bearer token (campo secreto) |
| `openweave.autoStart` | `boolean` | `false` | Conectar automáticamente al abrir un workspace con `.weave/` |
| `openweave.refreshIntervalMs` | `number` | `5000` | Intervalo de polling en ms. `0` = solo SSE |
| `openweave.provider` | `string` | `sqlite` | Proveedor al lanzar WeaveLink con `Start WeaveLink Server` |

Edita en `.vscode/settings.json` o vía `File → Preferences → Settings → OpenWeave`.

---

## Arquitectura

```
src/
├── extension.ts                   ← activate() / deactivate()
├── types.ts                       ← tipos compartidos
├── client/
│   └── WeaveExtensionClient.ts    ← HTTP client (REST + SSE + polling)
├── sidebar/
│   ├── GraphWebviewPanel.ts       ← webview D3 force-directed graph
│   ├── MilestoneTreeProvider.ts   ← TreeDataProvider milestones
│   └── SessionTreeProvider.ts     ← TreeDataProvider sessions
├── commands/
│   ├── init.ts                    ← openweave.init
│   ├── query.ts                   ← openweave.query
│   ├── saveNode.ts                ← openweave.saveNode
│   └── connect.ts                 ← openweave.connect
├── chat/
│   └── WeaveChatParticipant.ts    ← participante @openweave Copilot Chat
└── status-bar/
    └── WeaveStatusBar.ts          ← indicador de conexión
```

---

## Changelog

### 0.1.0

- Sidebar con Knowledge Graph (D3), Milestones y Sessions
- 7 comandos en la paleta
- Participante Copilot Chat `@openweave` con 5 slash commands y resolución de lenguaje natural
- Barra de estado con conteo de nodos
- SSE + polling como fallback para actualizaciones en tiempo real
