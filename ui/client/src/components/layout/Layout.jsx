import Sidebar from './Sidebar';

export default function Layout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50 shadow-[inset_1px_0_0_0_rgb(0,0,0,0.04)]">
        {children}
      </main>
    </div>
  );
}
