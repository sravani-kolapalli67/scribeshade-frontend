import { SignUp } from "@clerk/clerk-react";

const SignUpPage = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4">
      <div className="w-full max-w-md">
        <SignUp 
          routing="path" 
          path="/sign-up" 
          signInUrl="/sign-in"
          appearance={{
            elements: {
              formButtonPrimary: 
                "bg-blue-600 hover:bg-blue-700 text-sm normal-case shadow-none",
              card: "shadow-xl border border-slate-100",
              headerTitle: "text-slate-900",
              headerSubtitle: "text-slate-500",
              socialButtonsBlockButton: "bg-white border-slate-200 hover:bg-slate-50 text-slate-900",
              socialButtonsBlockButtonText: "text-slate-600 font-medium",
              formFieldLabel: "text-slate-700 font-medium",
              formFieldInput: "bg-white border-slate-200 text-slate-900 focus:border-blue-500 focus:ring-blue-500",
              footerActionText: "text-slate-500",
              footerActionLink: "text-blue-600 hover:text-blue-500",
            },
          }}
        />
      </div>
    </div>
  );
};

export default SignUpPage;
