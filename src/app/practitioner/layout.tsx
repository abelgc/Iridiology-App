import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { SidebarProvider } from '@/components/layout/sidebar-provider'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <div className="flex h-full print:block print:h-auto">
        <Sidebar />
        <div className="flex-1 flex flex-col ml-0 md:ml-64 px-4 md:px-0 print:ml-0 print:px-0">
          <Header />
          <main className="flex-1 overflow-auto pt-16 bg-zinc-50 print:overflow-visible print:pt-0 print:bg-white">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
