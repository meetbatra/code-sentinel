import { Header } from "@/components/header";

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[#fff8f2] dark:bg-background dark:bg-[radial-gradient(#393e4a_1px,transparent_1px)] bg-[radial-gradient(#f1dbc5_1px,transparent_1px)] [background-size:16px_16px]">
      <Header />
      {children}
    </div>
  );
}
