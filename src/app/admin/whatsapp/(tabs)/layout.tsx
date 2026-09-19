import WhatsAppHeader from '@/components/admin/WhatsAppHeader';

/**
 * The WhatsApp section: one head and one row of tabs above five views of the
 * club's single sending number.
 *
 * It is a route group rather than a plain layout so that the one screen under
 * /admin/whatsapp that is a form — writing a new template — can sit outside
 * it and carry its own head, as the design draws it.
 *
 * The section exists because Meta's rules do, and they shape every screen
 * under here — what may be sent, to whom, when, and at what cost. See the
 * WhatsApp section of the README, and `src/lib/notify.ts`, which is the code
 * that actually sends.
 */
export default function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 grow flex-col gap-7 px-10 py-10">
      <WhatsAppHeader />
      {children}
    </div>
  );
}
