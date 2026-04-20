export type Lang = 'en' | 'es'

export const translations = {
  en: {
    // shell
    appTitle: 'Iridology Analysis',
    continue: 'Continue',
    back: 'Back',
    submit: 'Submit',
    loading: 'Loading...',
    error: 'Something went wrong',
    // entry page
    chooseLanguage: 'Choose your language',
    chooseTier: 'Choose your report',
    tierBasicTitle: 'Basic Report',
    tierBasicPrice: '€12',
    tierBasicDescription: 'Full 11-section iridology report. Fast turnaround.',
    tierPremiumTitle: 'Premium Report',
    tierPremiumPrice: '€19.90',
    tierPremiumDescription: 'In-depth analysis with richer emotional field interpretation.',
    // intake form
    intakeTitle: 'Tell us about you',
    fieldFullName: 'Full name',
    fieldEmail: 'Email',
    fieldMainComplaint: 'Main health concern',
    fieldSymptomDuration: 'How long have you had this concern?',
    fieldCurrentMedications: 'Current medications (optional)',
    fieldDateOfBirth: 'Date of birth',
    fieldCountryOfBirth: 'Country of birth',
    fieldCityOfBirth: 'City of birth',
    fieldTimeOfDay: 'Were you born in the morning or evening?',
    timeOfDayMorning: 'Morning',
    timeOfDayEvening: 'Evening',
    // payment (mock)
    paymentMockHeading: 'Mock payment (test mode)',
    paymentMockBody: 'Payment is disabled while we test the flow. Click continue to proceed.',
    // upload
    uploadTitle: 'Upload your iris photos',
    uploadTutorialHeading: 'How to take the photos',
    uploadTutorialLinkLabel: 'View the photo tutorial',
    uploadRightEye: 'Right eye',
    uploadLeftEye: 'Left eye',
    uploadAnalyzing: 'Analyzing your iris patterns...',
    // report
    reportReady: 'Your report is ready',
    reportDownload: 'Download PDF',
    reportEmail: 'Email me this report',
    reportPrint: 'Print',
    reportEmailSent: 'Report sent to your email.',
    // errors
    errorImageTooLarge: 'Image is larger than 10 MB.',
    errorImageFormat: 'Only JPEG and PNG images are accepted.',
    errorImageDimensions: 'Image must be at least 800×800 pixels.',
    errorImageCount: 'Please upload exactly 2 images: right eye and left eye.',
    errorIntakeRequired: 'This field is required.',
    errorEmailFormat: 'Please enter a valid email address.',
  },
  es: {
    appTitle: 'Análisis de Iridología',
    continue: 'Continuar',
    back: 'Atrás',
    submit: 'Enviar',
    loading: 'Cargando...',
    error: 'Algo salió mal',
    chooseLanguage: 'Elige tu idioma',
    chooseTier: 'Elige tu informe',
    tierBasicTitle: 'Informe Básico',
    tierBasicPrice: '€12',
    tierBasicDescription: 'Informe iridológico completo de 11 secciones. Entrega rápida.',
    tierPremiumTitle: 'Informe Premium',
    tierPremiumPrice: '€19,90',
    tierPremiumDescription: 'Análisis en profundidad con interpretación más rica del campo emocional.',
    intakeTitle: 'Cuéntanos sobre ti',
    fieldFullName: 'Nombre completo',
    fieldEmail: 'Correo electrónico',
    fieldMainComplaint: 'Principal preocupación de salud',
    fieldSymptomDuration: '¿Hace cuánto tienes esta preocupación?',
    fieldCurrentMedications: 'Medicamentos actuales (opcional)',
    fieldDateOfBirth: 'Fecha de nacimiento',
    fieldCountryOfBirth: 'País de nacimiento',
    fieldCityOfBirth: 'Ciudad de nacimiento',
    fieldTimeOfDay: '¿Naciste por la mañana o por la tarde/noche?',
    timeOfDayMorning: 'Mañana',
    timeOfDayEvening: 'Tarde/Noche',
    paymentMockHeading: 'Pago simulado (modo de prueba)',
    paymentMockBody: 'El pago está deshabilitado mientras probamos el flujo. Pulsa continuar para proceder.',
    uploadTitle: 'Sube tus fotos del iris',
    uploadTutorialHeading: 'Cómo tomar las fotos',
    uploadTutorialLinkLabel: 'Ver el tutorial de fotos',
    uploadRightEye: 'Ojo derecho',
    uploadLeftEye: 'Ojo izquierdo',
    uploadAnalyzing: 'Analizando los patrones de tu iris...',
    reportReady: 'Tu informe está listo',
    reportDownload: 'Descargar PDF',
    reportEmail: 'Enviarme este informe por correo',
    reportPrint: 'Imprimir',
    reportEmailSent: 'Informe enviado a tu correo.',
    errorImageTooLarge: 'La imagen pesa más de 10 MB.',
    errorImageFormat: 'Solo se aceptan imágenes JPEG y PNG.',
    errorImageDimensions: 'La imagen debe ser de al menos 800×800 píxeles.',
    errorImageCount: 'Por favor sube exactamente 2 imágenes: ojo derecho y ojo izquierdo.',
    errorIntakeRequired: 'Este campo es obligatorio.',
    errorEmailFormat: 'Por favor introduce un correo válido.',
  },
} as const

export type TranslationKey = keyof typeof translations.en

export function t(lang: Lang, key: TranslationKey): string {
  const dict = translations[lang] ?? translations.en
  return (dict as Record<string, string>)[key] ?? key
}

export function detectLocale(navigatorLang: string | undefined): Lang {
  if (!navigatorLang) return 'en'
  return navigatorLang.toLowerCase().startsWith('es') ? 'es' : 'en'
}
