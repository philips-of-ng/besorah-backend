import express from "express";
import {
  createEvent,
  createEventType,
  endActiveService,
  findOrCreate,
  getEventTypes,
} from "../controllers/eventController.js";

const router = express.Router();

router.post("/event", createEvent);
router.post("/event/active", findOrCreate);
router.post("/attendance/terminate", endActiveService);
router.post("/event/types", createEventType);
router.get("/event/types", getEventTypes);

export default router;
