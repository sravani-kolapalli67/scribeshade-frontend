import { configureStore } from "@reduxjs/toolkit";
import resumeBuilderReducer from "./resumeBuilderSlice";
import aiProjectsReducer from "./aiProjectsSlice";

export const store = configureStore({
  reducer: {
    resumeBuilder: resumeBuilderReducer,
    aiProjects:    aiProjectsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
