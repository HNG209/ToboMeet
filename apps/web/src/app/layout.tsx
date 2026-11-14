import StoreProvider from "@/lib/redux/StoreProvider";
import { createClient } from "@/lib/supabase/server";
import { EventProvider } from "@/providers/EventProvider";
import { ConfirmProvider } from "@/providers/ConfirmProvider";
import { GpsSync } from "@/components/common/GpsSync";
import { Toaster } from "sonner";

export const preferredRegion = "sin1";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const userId = user?.id;

  return (
    <StoreProvider>
      <ConfirmProvider>
        <GpsSync />
        <EventProvider userId={userId}>{children}</EventProvider>
      </ConfirmProvider>
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </StoreProvider>
  );
}
