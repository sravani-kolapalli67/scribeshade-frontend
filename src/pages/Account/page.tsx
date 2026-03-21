import { UserProfile } from "@clerk/clerk-react";

const AccountPage = () => {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <UserProfile
          appearance={{
            elements: {
              rootBox: "w-full mx-auto",
              card: "shadow-none border-none w-full",
              navbar: "hidden",
              pageScrollBox: "p-8",
            },
          }}
        />
      </div>
    </div>
  );
};

export default AccountPage;
