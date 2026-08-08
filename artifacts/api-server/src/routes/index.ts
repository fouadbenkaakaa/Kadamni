import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import jobsRouter from "./jobs";
import workersRouter from "./workers";
import servicesRouter from "./services";
import favoritesRouter from "./favorites";
import conversationsRouter from "./conversations";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(jobsRouter);
router.use(workersRouter);
router.use(servicesRouter);
router.use(favoritesRouter);
router.use(conversationsRouter);
router.use(notificationsRouter);

export default router;
