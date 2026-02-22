# 🗺️ WeavePath

> Milestone & sub-task planner for OpenWeave intelligent agents

## Overview

**WeavePath** is the planning engine for OpenWeave. It transforms high-level goals into structured milestones and sub-tasks, enabling agents to:

- Break down complex problems into actionable steps
- Generate and maintain dynamic roadmaps
- Track progress across sessions
- Recommend next actionable sub-tasks
- Auto-generate `roadmap.md` documentation

## Features

- **Epic → Milestone → Sub-task** hierarchical planning
- **Smart next-action resolver** - determine what to work on next
- **Roadmap auto-generation** - create living documentation
- **Session persistence** - save/load milestone state
- **Progress tracking** - monitor completion rates
- **Dependency resolution** - handle task prerequisites

## Architecture

```
┌─────────────────────────────────┐
│      Goal / Epic               │
├─────────────────────────────────┤
│  ┌─────────────────────────────┐│
│  │   Milestone (M1, M2, M3...) ││
│  ├─────────────────────────────┤│
│  │ ┌─────────────────────────┐ ││
│  │ │  Sub-task 1 (🔜 10%)   │ ││
│  │ │  Sub-task 2 (🔄 50%)   │ ││
│  │ │  Sub-task 3 (✅ 100%)  │ ││
│  │ └─────────────────────────┘ ││
│  └─────────────────────────────┘│
└─────────────────────────────────┘
```

## Usage

```typescript
import { WeavePath } from "@openweave/weave-path";

const planner = new WeavePath({
  goal: "Build OpenWeave foundation",
  phaseCount: 5,
  estimatedHours: 80
});

// Add milestones
planner.addMilestone({
  id: "M1",
  name: "WeaveGraph Core",
  description: "Knowledge graph engine",
  estimatedHours: 20,
  dependencies: []
});

// Get next action
const nextAction = planner.getNextAction();
console.log(nextAction.title);

// Generate roadmap
const roadmap = planner.generateRoadmap();
console.log(roadmap);
```

## Related Packages

- **@openweave/weave-graph** - Knowledge graph storage and retrieval
- **@openweave/weave-lint** - Code quality and orphan detection
- **@openweave/weave-link** - MCP server for integrations
