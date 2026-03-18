import { useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { SignIn, useAuth, useUser } from "@clerk/clerk-react";
import Navbar from "./components/Navbar";

function App() {
  const { isSignedIn } = useUser();
  const { getToken } = useAuth();

  const callBackend = async () => {
    const token = await getToken();

    const res = await fetch("http://localhost:3000/api/protected", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    console.log(data);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl md:text-6xl tracking-tight">
            Welcome to <span className="text-indigo-600">ScribeShade</span>
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            Experience the next generation of creative shading and writing.
          </p>

          <div className="mt-10">
            {isSignedIn ? (
              <div className="space-y-4">
                <button
                  onClick={callBackend}
                  className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
                >
                  Call Protected Backend
                </button>
                <p className="text-sm text-gray-500">
                  You are successfully logged in.
                </p>
              </div>
            ) : (
              <div className="p-8 bg-white rounded-xl shadow-xl border border-gray-100 max-w-sm mx-auto animate-in fade-in slide-in-from-bottom-5 duration-700">
                <p className="text-gray-600 mb-6">
                  Please sign in to access your dashboard and tools.
                </p>
                {/* <SignIn fallbackRedirectUrl="/" /> */}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
