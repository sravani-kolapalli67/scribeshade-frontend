import { configureStore } from "@reduxjs/toolkit";
import resumeBuilderReducer from "./resumeBuilderSlice";

export const store = configureStore({
  reducer: {
    resumeBuilder: resumeBuilderReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
