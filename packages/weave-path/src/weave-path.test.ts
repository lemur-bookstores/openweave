import { describe, it, expect, beforeEach } from "vitest";
import { WeavePath, RoadmapGenerator } from "../src/index";
import { Status, Priority } from "../src/types";

describe("WeavePath", () => {
  let planner: WeavePath;

  beforeEach(() => {
    planner = new WeavePath({
      goal: "Build OpenWeave foundation",
      estimatedTotalHours: 100,
    });
  });

  describe("Milestone Management", () => {
    it("should create a new WeavePath planner", () => {
      expect(planner).toBeDefined();
    });

    it("should add milestones", () => {
      planner.addMilestone({
        id: "M1",
        name: "WeaveGraph Core",
        description: "Implement knowledge graph engine",
        priority: Priority.CRITICAL,
        estimatedHours: 20,
        subTasks: [],
        dependencies: [],
        successCriteria: ["All CRUD operations working"],
      });

      const m1 = planner.getMilestone("M1");
      expect(m1).toBeDefined();
      expect(m1?.name).toBe("WeaveGraph Core");
      expect(m1?.status).toBe(Status.NOT_STARTED);
    });

    it("should update milestone status", () => {
      planner.addMilestone({
        id: "M1",
        name: "Test Milestone",
        description: "Test",
        priority: Priority.MEDIUM,
        estimatedHours: 10,
        subTasks: [],
        dependencies: [],
        successCriteria: [],
      });

      planner.updateMilestoneStatus("M1", Status.IN_PROGRESS);
      expect(planner.getMilestone("M1")?.status).toBe(Status.IN_PROGRESS);

      planner.updateMilestoneStatus("M1", Status.COMPLETED);
      expect(planner.getMilestone("M1")?.status).toBe(Status.COMPLETED);
      expect(planner.getMilestone("M1")?.completionDate).toBeDefined();
    });

    it("should track actual hours spent", () => {
      planner.addMilestone({
        id: "M1",
        name: "Milestone",
        description: "Test",
        priority: Priority.MEDIUM,
        estimatedHours: 20,
        subTasks: [],
        dependencies: [],
        successCriteria: [],
      });

      planner.updateMilestoneHours("M1", 5);
      planner.updateMilestoneHours("M1", 3);

      const m1 = planner.getMilestone("M1");
      expect(m1?.actualHours).toBe(8);
    });
  });

  describe("Sub-task Management", () => {
    beforeEach(() => {
      planner.addMilestone({
        id: "M1",
        name: "Core",
        description: "Test",
        priority: Priority.CRITICAL,
        estimatedHours: 20,
        subTasks: [],
        dependencies: [],
        successCriteria: [],
      });
    });

    it("should add sub-tasks to milestones", () => {
      planner.addSubTask("M1", {
        id: "M1-1",
        title: "Design data model",
        description: "Define schemas",
        priority: Priority.CRITICAL,
        estimatedHours: 5,
        dependencies: [],
      });

      const m1 = planner.getMilestone("M1");
      expect(m1?.subTasks).toHaveLength(1);
      expect(m1?.subTasks[0].title).toBe("Design data model");
    });

    it("should update sub-task status", () => {
      planner.addSubTask("M1", {
        id: "M1-1",
        title: "Task 1",
        description: "Test",
        priority: Priority.MEDIUM,
        estimatedHours: 3,
        dependencies: [],
      });

      planner.updateSubTaskStatus("M1", "M1-1", Status.IN_PROGRESS);
      const m1 = planner.getMilestone("M1");
      expect(m1?.subTasks[0].status).toBe(Status.IN_PROGRESS);

      planner.updateSubTaskStatus("M1", "M1-1", Status.COMPLETED);
      expect(m1?.subTasks[0].status).toBe(Status.COMPLETED);
      expect(m1?.subTasks[0].completionDate).toBeDefined();
    });

    it("should auto-update milestone status when all sub-tasks complete", () => {
      planner.addSubTask("M1", {
        id: "M1-1",
        title: "Task 1",
        description: "Test",
        priority: Priority.MEDIUM,
        estimatedHours: 2,
        dependencies: [],
      });

      planner.addSubTask("M1", {
        id: "M1-2",
        title: "Task 2",
        description: "Test",
        priority: Priority.MEDIUM,
        estimatedHours: 2,
        dependencies: [],
      });

      planner.updateSubTaskStatus("M1", "M1-1", Status.COMPLETED);
      let m1 = planner.getMilestone("M1");
      expect(m1?.status).toBe(Status.NOT_STARTED); // Not all complete yet

      planner.updateSubTaskStatus("M1", "M1-2", Status.COMPLETED);
      m1 = planner.getMilestone("M1");
      expect(m1?.status).toBe(Status.COMPLETED); // All complete, milestone auto-updated
    });
  });

  describe("Progress Metrics", () => {
    beforeEach(() => {
      planner.addMilestone({
        id: "M1",
        name: "Core",
        description: "Test",
        priority: Priority.CRITICAL,
        estimatedHours: 20,
        subTasks: [],
        dependencies: [],
        successCriteria: [],
        startDate: new Date(),
      });

      planner.addSubTask("M1", {
        id: "M1-1",
        title: "Task 1",
        description: "Test",
        priority: Priority.MEDIUM,
        estimatedHours: 5,
        dependencies: [],
      });

      planner.addSubTask("M1", {
        id: "M1-2",
        title: "Task 2",
        description: "Test",
        priority: Priority.MEDIUM,
        estimatedHours: 5,
        dependencies: [],
      });
    });

    it("should calculate progress metrics", () => {
      const metrics = planner.getProgressMetrics("M1");
      expect(metrics).toBeDefined();
      expect(metrics?.totalSubTasks).toBe(2);
      expect(metrics?.completedSubTasks).toBe(0);
      expect(metrics?.completionPercentage).toBe(0);
    });

    it("should track completion percentage", () => {
      planner.updateSubTaskStatus("M1", "M1-1", Status.COMPLETED);
      let metrics = planner.getProgressMetrics("M1");
      expect(metrics?.completionPercentage).toBe(50);

      planner.updateSubTaskStatus("M1", "M1-2", Status.COMPLETED);
      metrics = planner.getProgressMetrics("M1");
      expect(metrics?.completionPercentage).toBe(100);
    });

    it("should calculate days elapsed", () => {
      const metrics = planner.getProgressMetrics("M1");
      expect(metrics?.daysElapsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Next Action Resolver", () => {
    beforeEach(() => {
      planner.addMilestone({
        id: "M1",
        name: "Priority 1",
        description: "Test",
        priority: Priority.CRITICAL,
        estimatedHours: 20,
        subTasks: [],
        dependencies: [],
        successCriteria: [],
      });

      planner.addSubTask("M1", {
        id: "M1-1",
        title: "First task",
        description: "Should be done first",
        priority: Priority.CRITICAL,
        estimatedHours: 5,
        dependencies: [],
      });

      planner.addSubTask("M1", {
        id: "M1-2",
        title: "Second task",
        description: "Depends on first",
        priority: Priority.MEDIUM,
        estimatedHours: 5,
        dependencies: ["M1-1"],
      });
    });

    it("should recommend next action", () => {
      const nextAction = planner.getNextAction();
      expect(nextAction).toBeDefined();
      expect(nextAction?.subTaskId).toBe("M1-1");
      expect(nextAction?.title).toBe("First task");
    });

    it("should respect task dependencies", () => {
      planner.updateSubTaskStatus("M1", "M1-1", Status.COMPLETED);
      const nextAction = planner.getNextAction();
      expect(nextAction?.subTaskId).toBe("M1-2");
    });

    it("should return null when all tasks complete", () => {
      planner.updateSubTaskStatus("M1", "M1-1", Status.COMPLETED);
      planner.updateSubTaskStatus("M1", "M1-2", Status.COMPLETED);
      const nextAction = planner.getNextAction();
      expect(nextAction).toBeNull();
    });
  });

  describe("Epic Progress", () => {
    it("should calculate overall epic progress", () => {
      planner.addMilestone({
        id: "M1",
        name: "Core",
        description: "Test",
        priority: Priority.CRITICAL,
        estimatedHours: 20,
        subTasks: [],
        dependencies: [],
        successCriteria: [],
      });

      planner.addSubTask("M1", {
        id: "M1-1",
        title: "Task",
        description: "Test",
        priority: Priority.MEDIUM,
        estimatedHours: 5,
        dependencies: [],
      });

      const progress = planner.getEpicProgress();
      expect(progress.totalSubTasks).toBe(1);
      expect(progress.completedSubTasks).toBe(0);
    });
  });

  describe("Roadmap Generation", () => {
    it("should generate roadmap document", () => {
      planner.addMilestone({
        id: "M1",
        name: "Core",
        description: "Test",
        priority: Priority.CRITICAL,
        estimatedHours: 20,
        subTasks: [],
        dependencies: [],
        successCriteria: [],
      });

      const roadmap = planner.generateRoadmap();
      expect(roadmap).toBeDefined();
      expect(roadmap.title).toBe("OpenWeave Development");
      expect(roadmap.stats).toBeDefined();
    });
  });

  describe("Session Persistence", () => {
    it("should save and load session state", () => {
      planner.addMilestone({
        id: "M1",
        name: "Core",
        description: "Test",
        priority: Priority.CRITICAL,
        estimatedHours: 20,
        subTasks: [],
        dependencies: [],
        successCriteria: [],
      });

      planner.updateMilestoneStatus("M1", Status.IN_PROGRESS);
      planner.updateMilestoneHours("M1", 5);

      const session = planner.saveSession("session-1");
      expect(session).toBeDefined();
      expect(session.completedMilestones).toHaveLength(0);

      // Create new planner and load session
      const planner2 = new WeavePath({
        goal: "Test",
      });
      planner2.addMilestone({
        id: "M1",
        name: "Core",
        description: "Test",
        priority: Priority.CRITICAL,
        estimatedHours: 20,
        subTasks: [],
        dependencies: [],
        successCriteria: [],
      });

      planner2.loadSession(session);
      expect(planner2.getMilestone("M1")?.status).toBe(Status.IN_PROGRESS);
      expect(planner2.getMilestone("M1")?.actualHours).toBe(5);
    });
  });
});

describe("RoadmapGenerator", () => {
  it("should generate markdown from roadmap document", () => {
    const doc = {
      title: "OpenWeave",
      lastUpdated: new Date(),
      overview: "Building the future",
      phases: [
        {
          phase: "Foundation",
          milestones: [
            {
              id: "M1",
              name: "Core",
              status: Status.COMPLETED,
              subTasks: [
                { id: "M1-1", title: "Task 1", status: Status.COMPLETED },
              ],
            },
          ],
        },
      ],
      stats: {
        totalMilestones: 1,
        completedMilestones: 1,
        totalHours: 20,
        hoursElapsed: 20,
      },
    };

    const markdown = RoadmapGenerator.generateMarkdown(doc);
    expect(markdown).toContain("# 🗺️ OpenWeave");
    expect(markdown).toContain("## Legend");
    expect(markdown).toContain("✅");
  });

  it("should generate progress bar", () => {
    const bar = RoadmapGenerator.generateProgressBar(5, 10);
    expect(bar).toContain("50%");
    expect(bar).toContain("█");
  });

  it("should generate summary table", () => {
    const doc = {
      title: "Test",
      lastUpdated: new Date(),
      overview: "Test",
      phases: [
        {
          phase: "Phase 1",
          milestones: [
            {
              id: "M1",
              name: "Milestone 1",
              status: Status.IN_PROGRESS,
              subTasks: [],
            },
          ],
        },
      ],
      stats: { totalMilestones: 1, completedMilestones: 0, totalHours: 10, hoursElapsed: 5 },
    };

    const table = RoadmapGenerator.generateSummaryTable(doc);
    expect(table).toContain("| Milestone | Status");
    expect(table).toContain("M1");
  });
});
