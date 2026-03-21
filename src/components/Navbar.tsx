const Navbar = ({ children }: { children: React.ReactNode }) => {
  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-50 shadow-sm animate-in fade-in duration-700">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-indigo-200 shadow-lg">
          <span className="text-white font-bold text-lg">S</span>
        </div>
        <span className="text-xl font-bold bg-clip-text text-transparent bg-linear-to-r from-indigo-600 to-purple-600 tracking-tight">
          ScribeShade
        </span>
      </div>
      {children}
    </nav>
  );
};

export default Navbar;
