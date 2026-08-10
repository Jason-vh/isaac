import { Elysia } from "elysia";
import { criticalPathRoutes } from "./criticalPath";
import { durationRoutes } from "./durations";
import { jobRoutes } from "./jobs";
import { mergeRequestPipelineRoutes } from "./mergeRequests";
import { trainDebugRoutes } from "./trainDebug";

export const pipelineRoutes = new Elysia({ prefix: "/api/pipelines" })
  .use(durationRoutes)
  .use(jobRoutes)
  .use(criticalPathRoutes)
  .use(mergeRequestPipelineRoutes)
  .use(trainDebugRoutes);
