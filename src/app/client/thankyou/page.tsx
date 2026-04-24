export default function ThankYouPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold">Thank you for your purchase</h1>
        <p className="text-muted-foreground">
          Your iridology report has been sent to your email as a PDF attachment.
          Please check your inbox — it may take a few minutes to arrive.
        </p>
        <p className="text-sm text-muted-foreground">
          If you do not receive it within 15 minutes, please check your spam folder.
        </p>
      </div>
    </main>
  )
}
