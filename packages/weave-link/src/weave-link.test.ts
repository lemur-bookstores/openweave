import { describe, it, expect, beforeEach } from "vitest";
import { WeaveLinkServer } from "../src/mcp-server";
import { ALL_TOOLS, getTool } from "../src/tools";

describe("WeaveLink MCP Server", () => {
  let server: WeaveLinkServer;

  beforeEach(() => {
    server = new WeaveLinkServer({
      name: "WeaveLink Test",
      version: "0.1.0",
    });
  });

  describe("Server Initialization", () => {
    it("should create a new MCP server", async () => {
      expect(server).toBeDefined();
      await server.initialize();
    });

    it("should have default configuration", () => {
      const info = server.getServerInfo();
      expect(info.name).toBe("WeaveLink Test");
      expect(info.version).toBe("0.1.0");
      expect(info.tools).toBeDefined();
      expect(info.tools.length).toBeGreaterThan(0);
    });
  });

  describe("Tool Management", () => {
    it("should list all available tools", () => {
      const tools = server.listTools();
      expect(tools).toHaveLength(7);
      expect(tools.map((t) => t.name)).toContain("save_node");
      expect(tools.map((t) => t.name)).toContain("query_graph");
      expect(tools.map((t) => t.name)).toContain("suppress_error");
      expect(tools.map((t) => t.name)).toContain("update_roadmap");
      expect(tools.map((t) => t.name)).toContain("get_session_context");
      expect(tools.map((t) => t.name)).toContain("get_next_action");
      expect(tools.map((t) => t.name)).toContain("list_orphans");
    });

    it("should retrieve tool by name", () => {
      const tool = getTool("save_node");
      expect(tool).toBeDefined();
      expect(tool?.name).toBe("save_node");
      expect(tool?.inputSchema.required).toContain("chat_id");
      expect(tool?.inputSchema.required).toContain("node_id");
    });

    it("should return undefined for unknown tool", () => {
      const tool = getTool("nonexistent_tool");
      expect(tool).toBeUndefined();
    });

    it("should have valid input schemas", () => {
      const tools = server.listTools();
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
        expect(tool.inputSchema.required).toBeDefined();
      }
    });
  });

  describe("Tool Execution - save_node", () => {
    it("should save a node successfully", async () => {
      const result = await server.callTool("save_node", {
        chat_id: "test-session",
        node_id: "concept-1",
        node_label: "Test Concept",
        node_type: "CONCEPT",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].data).toBeDefined();
    });

    it("should validate required fields", async () => {
      const result = await server.callTool("save_node", {
        node_id: "concept-1",
        node_label: "Test",
      });

      expect(result.content[0].text).toContain("Error");
    });

    it("should accept optional metadata", async () => {
      const result = await server.callTool("save_node", {
        chat_id: "test-session",
        node_id: "concept-1",
        node_label: "Test",
        node_type: "CONCEPT",
        metadata: { key: "value" },
        frequency: 50,
      });

      expect(result.content).toBeDefined();
    });
  });

  describe("Tool Execution - query_graph", () => {
    it("should query the graph", async () => {
      const result = await server.callTool("query_graph", {
        chat_id: "test-session",
        query: "test query",
      });

      const data = result.content[0].data as Record<string, unknown>;
      expect(data.query).toBe("test query");
      expect(Array.isArray(data.results)).toBe(true);
    });

    it("should respect limit parameter", async () => {
      const result = await server.callTool("query_graph", {
        chat_id: "test-session",
        query: "test",
        limit: 5,
      });

      const data = result.content[0].data as Record<string, unknown>;
      expect((data.results as unknown[]).length).toBeLessThanOrEqual(5);
    });

    it("should validate required fields", async () => {
      const result = await server.callTool("query_graph", {
        query: "test",
      });

      expect(result.content[0].text).toContain("Error");
    });
  });

  describe("Tool Execution - suppress_error", () => {
    it("should suppress an error", async () => {
      const result = await server.callTool("suppress_error", {
        chat_id: "test-session",
        node_id: "error-1",
        error_label: "TypeError",
        description: "Fixed type mismatch",
      });

      const data = result.content[0].data as Record<string, unknown>;
      expect(data.error_node_id).toBe("error-1");
      expect(data.correction_node_id).toBeDefined();
    });

    it("should validate all required fields", async () => {
      const result = await server.callTool("suppress_error", {
        chat_id: "test-session",
        // missing other required fields
      });

      expect(result.content[0].text).toContain("Error");
    });
  });

  describe("Tool Execution - update_roadmap", () => {
    it("should update milestone status", async () => {
      const result = await server.callTool("update_roadmap", {
        chat_id: "test-session",
        milestone_id: "M1",
        status: "IN_PROGRESS",
        actual_hours: 3,
      });

      const data = result.content[0].data as Record<string, unknown>;
      expect(data.milestone_id).toBe("M1");
      expect(data.status).toBe("IN_PROGRESS");
    });

    it("should accept all status values", async () => {
      const statuses = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED", "DEFERRED"];

      for (const status of statuses) {
        const result = await server.callTool("update_roadmap", {
          chat_id: "test-session",
          milestone_id: "M1",
          status,
        });

        expect(result.content[0].text || result.content[0].data).toBeDefined();
      }
    });
  });

  describe("Tool Execution - get_session_context", () => {
    it("should retrieve session context", async () => {
      const result = await server.callTool("get_session_context", {
        chat_id: "test-session",
      });

      const data = result.content[0].data as Record<string, unknown>;
      expect(data.total_nodes).toBeDefined();
      expect(data.total_edges).toBeDefined();
      expect(data.context_size_bytes).toBeDefined();
      expect(data.nodes).toBeDefined();
    });

    it("should accept optional parameters", async () => {
      const result = await server.callTool("get_session_context", {
        chat_id: "test-session",
        max_depth: 3,
        include_archived: true,
      });

      expect(result.content).toBeDefined();
    });
  });

  describe("Tool Execution - get_next_action", () => {
    it("should return next action", async () => {
      const result = await server.callTool("get_next_action", {
        chat_id: "test-session",
      });

      const data = result.content[0].data as Record<string, unknown>;
      expect(data.sub_task_id).toBeDefined();
      expect(data.milestone_id).toBeDefined();
      expect(data.title).toBeDefined();
      expect(data.estimated_hours).toBeDefined();
    });
  });

  describe("Tool Execution - list_orphans", () => {
    it("should list orphan code", async () => {
      const result = await server.callTool("list_orphans", {
        project_path: "/path/to/project",
        min_severity: "MEDIUM",
      });

      const data = result.content[0].data as Record<string, unknown>;
      expect(data.project_path).toBe("/path/to/project");
      expect(data.orphans_found).toBeGreaterThanOrEqual(0);
    });

    it("should validate required fields", async () => {
      const result = await server.callTool("list_orphans", {});

      expect(result.content[0].text).toContain("Error");
    });
  });

  describe("Error Handling", () => {
    it("should handle unknown tools", async () => {
      const result = await server.callTool("unknown_tool", {});
      expect(result.content[0].text).toContain("Error");
    });

    it("should handle tool errors gracefully", async () => {
      const result = await server.callTool("save_node", {
        // Invalid arguments
      });

      expect(result.content[0].text || result.content[0].data).toBeDefined();
    });
  });

  describe("Server Info", () => {
    it("should provide server information", () => {
      const info = server.getServerInfo();

      expect(info).toHaveProperty("name");
      expect(info).toHaveProperty("version");
      expect(info).toHaveProperty("description");
      expect(info).toHaveProperty("tools");
      expect(Array.isArray(info.tools)).toBe(true);
    });

    it("should list all tools in server info", () => {
      const info = server.getServerInfo();
      const toolNames = info.tools.map((t) => (t as Record<string, unknown>).name);

      expect(toolNames).toContain("save_node");
      expect(toolNames).toContain("query_graph");
      expect(toolNames).toContain("suppress_error");
      expect(toolNames).toContain("update_roadmap");
      expect(toolNames).toContain("get_session_context");
      expect(toolNames).toContain("get_next_action");
      expect(toolNames).toContain("list_orphans");
    });
  });

  describe("Tool Definitions", () => {
    it("should have all tools exported", () => {
      expect(ALL_TOOLS.length).toBe(7);
    });

    it("should have descriptive tool information", () => {
      const tool = ALL_TOOLS.find((t) => t.name === "save_node");
      expect(tool?.description).toContain("node");
      expect(tool?.description.length).toBeGreaterThan(10);
    });

    it("should have valid input schema properties", () => {
      for (const tool of ALL_TOOLS) {
        const props = Object.keys(tool.inputSchema.properties);
        expect(props.length).toBeGreaterThan(0);

        // Check that all required fields are in properties
        for (const required of tool.inputSchema.required) {
          expect(props).toContain(required);
        }
      }
    });

    it("should have type information for properties", () => {
      const tool = ALL_TOOLS.find((t) => t.name === "save_node");
      const props = tool?.inputSchema.properties as Record<string, unknown>;

      expect((props.chat_id as Record<string, unknown>).type).toBe("string");
      expect((props.node_id as Record<string, unknown>).type).toBe("string");
    });
  });
});
