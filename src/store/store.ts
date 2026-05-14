import { configureStore } from "@reduxjs/toolkit";
import resumeBuilderReducer from "./resumeBuilderSlice";
import aiProjectsReducer from "./aiProjectsSlice";
import settingsReducer from "@/features/settings/slices/settingsSlice";
import overlayReducer from "@/features/launcher/slices/overlaySlice";
import sessionFlowReducer from "@/features/session/slices/sessionFlowSlice";
import floatingSessionReducer from "@/features/session/slices/floatingSessionSlice";

export const store = configureStore({
  reducer: {
    resumeBuilder:   resumeBuilderReducer,
    aiProjects:      aiProjectsReducer,
    settings:        settingsReducer,
    overlay:         overlayReducer,
    sessionFlow:     sessionFlowReducer,
    floatingSession: floatingSessionReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
