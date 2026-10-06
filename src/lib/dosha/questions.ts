import type { Lang } from '@/lib/i18n'

/**
 * The teacher's questions, in the order they were supplied.
 * Option keys are the score, always vata then pitta then kapha.
 * The same list is asked twice. Part instructions live in the page.
 *
 * All 27 questions are in DOSHA_QUESTIONS, in the teacher's order.
 * Append any later question to the end of the array.
 *
 * Shape of one question:
 * {
 *   id: 'body-frame',
 *   category: { en: 'Body frame', es: '...', de: '...' },
 *   prompt: { en: '...', es: '...', de: '...' },
 *   options: {
 *     vata: { en: '...', es: '...', de: '...' },
 *     pitta: { en: '...', es: '...', de: '...' },
 *     kapha: { en: '...', es: '...', de: '...' },
 *   },
 * }
 */
export type DoshaQuestionText = {
  en: string
  es: string
  de: string
}

export type DoshaQuestion = {
  id: string
  category: DoshaQuestionText
  prompt: DoshaQuestionText
  options: {
    vata: DoshaQuestionText
    pitta: DoshaQuestionText
    kapha: DoshaQuestionText
  }
}

export function localize(text: DoshaQuestionText, lang: Lang): string {
  return text[lang]
}

function line(en: string, es: string, de: string): DoshaQuestionText {
  return { en, es, de }
}

function question(
  id: string,
  category: DoshaQuestionText,
  prompt: DoshaQuestionText,
  vata: DoshaQuestionText,
  pitta: DoshaQuestionText,
  kapha: DoshaQuestionText,
): DoshaQuestion {
  return { id, category, prompt, options: { vata, pitta, kapha } }
}

export const DOSHA_QUESTIONS: DoshaQuestion[] = [
  question(
    'body-frame',
    line('Body frame', 'Complexión', 'Körperbau'),
    line(
      'What has your natural body frame been most of your life?',
      '¿Cómo ha sido tu complexión natural la mayor parte de tu vida?',
      'Wie war dein natürlicher Körperbau die meiste Zeit deines Lebens?',
    ),
    line('Light or narrow', 'Ligera o estrecha', 'Leicht oder schmal'),
    line('Medium or defined', 'Media o definida', 'Mittel oder definiert'),
    line('Solid or broad', 'Sólida o ancha', 'Kräftig oder breit'),
  ),
  question(
    'weight-pattern',
    line('Weight pattern', 'Patrón de peso', 'Gewichtsmuster'),
    line(
      'What has your natural weight pattern been?',
      '¿Cuál ha sido tu patrón natural de peso?',
      'Wie war dein natürliches Gewichtsmuster?',
    ),
    line('Changes quickly or runs light', 'Cambia rápido o se queda ligero', 'Ändert sich schnell oder bleibt leicht'),
    line('Responds clearly to habits', 'Responde claro a los hábitos', 'Reagiert deutlich auf Gewohnheiten'),
    line('Changes slowly or holds easily', 'Cambia lento o se sostiene fácil', 'Ändert sich langsam oder hält leicht'),
  ),
  question(
    'skin',
    line('Skin', 'Piel', 'Haut'),
    line(
      'What has your skin naturally tended toward?',
      '¿Hacia qué ha tendido tu piel de forma natural?',
      'Wozu hat deine Haut von Natur aus geneigt?',
    ),
    line('Thin, dry, or easily rough', 'Fina, seca o áspera con facilidad', 'Dünn, trocken oder leicht rau'),
    line('Sensitive, warm, or reactive', 'Sensible, cálida o reactiva', 'Empfindlich, warm oder reaktiv'),
    line('Smooth, soft, or oilier', 'Suave, blanda o más grasa', 'Glatt, weich oder öliger'),
  ),
  question(
    'hair',
    line('Hair', 'Cabello', 'Haar'),
    line(
      'What has your hair naturally tended toward?',
      '¿Hacia qué ha tendido tu cabello de forma natural?',
      'Wozu hat dein Haar von Natur aus geneigt?',
    ),
    line('Fine, dry, or changeable', 'Fino, seco o cambiante', 'Fein, trocken oder wechselhaft'),
    line('Fine, oily, or easily thinned', 'Fino, graso o se aclara fácil', 'Fein, ölig oder leicht licht'),
    line('Thick, full, or naturally glossy', 'Grueso, abundante o con brillo natural', 'Dick, voll oder von Natur aus glänzend'),
  ),
  question(
    'eyes-gaze',
    line('Eyes / gaze', 'Ojos / mirada', 'Augen / Blick'),
    line(
      'What best describes your natural eyes or gaze?',
      '¿Qué describe mejor tus ojos o tu mirada natural?',
      'Was beschreibt deine natürlichen Augen oder deinen Blick am besten?',
    ),
    line('Quick, expressive, or restless', 'Rápida, expresiva o inquieta', 'Schnell, ausdrucksstark oder unruhig'),
    line('Sharp, focused, or intense', 'Aguda, enfocada o intensa', 'Scharf, fokussiert oder intensiv'),
    line('Soft, steady, or calm', 'Suave, estable o calma', 'Weich, stetig oder ruhig'),
  ),
  question(
    'appetite',
    line('Appetite', 'Apetito', 'Appetit'),
    line(
      'What has your natural appetite been like?',
      '¿Cómo ha sido tu apetito natural?',
      'Wie war dein natürlicher Appetit?',
    ),
    line('Irregular or unpredictable', 'Irregular o impredecible', 'Unregelmäßig oder unvorhersehbar'),
    line('Strong and hard to ignore', 'Fuerte y difícil de ignorar', 'Stark und schwer zu überhören'),
    line('Steady, mild, or slower to build', 'Estable, suave o tarda en llegar', 'Gleichmäßig, mild oder langsamer im Aufbau'),
  ),
  question(
    'digestion',
    line('Digestion', 'Digestión', 'Verdauung'),
    line(
      'What has your digestion naturally been like?',
      '¿Cómo ha sido tu digestión de forma natural?',
      'Wie war deine Verdauung von Natur aus?',
    ),
    line('Variable or easily unsettled', 'Variable o se altera con facilidad', 'Wechselhaft oder leicht aus dem Gleichgewicht'),
    line('Fast, sharp, or acidic', 'Rápida, intensa o ácida', 'Schnell, scharf oder säuerlich'),
    line('Slow, heavy, or lingering', 'Lenta, pesada o se alarga', 'Langsam, schwer oder anhaltend'),
  ),
  question(
    'elimination',
    line('Elimination', 'Eliminación', 'Ausscheidung'),
    line(
      'What has your natural bowel pattern been?',
      '¿Cuál ha sido tu patrón intestinal natural?',
      'Wie war dein natürliches Muster beim Stuhlgang?',
    ),
    line('Irregular, dry, or difficult', 'Irregular, seco o difícil', 'Unregelmäßig, trocken oder schwer'),
    line('Frequent, urgent, or loose', 'Frecuente, urgente o suelto', 'Häufig, dringend oder weich'),
    line('Slow, sticky, or incomplete', 'Lento, pegajoso o incompleto', 'Langsam, klebrig oder unvollständig'),
  ),
  question(
    'temperature',
    line('Temperature', 'Temperatura', 'Temperatur'),
    line(
      'What has your natural temperature tendency been?',
      '¿Cuál ha sido tu tendencia natural de temperatura?',
      'Wie war deine natürliche Temperatur-Neigung?',
    ),
    line('I get cold easily', 'Me enfrío con facilidad', 'Mir wird leicht kalt'),
    line('I get warm easily', 'Me acaloro con facilidad', 'Mir wird leicht warm'),
    line('I feel affected by dampness', 'Me afecta la humedad', 'Feuchtigkeit setzt mir zu'),
  ),
  question(
    'sleep',
    line('Sleep', 'Sueño', 'Schlaf'),
    line(
      'What has your natural sleep pattern been?',
      '¿Cuál ha sido tu patrón natural de sueño?',
      'Wie war dein natürliches Schlafmuster?',
    ),
    line('Light or easily interrupted', 'Ligero o se interrumpe fácil', 'Leicht oder leicht unterbrochen'),
    line('Moderate but easily heated', 'Moderado, pero me acaloro fácil', 'Mäßig, aber ich werde leicht warm'),
    line('Deep, long, or hard to leave', 'Profundo, largo o cuesta dejarlo', 'Tief, lang oder schwer zu verlassen'),
  ),
  question(
    'energy',
    line('Energy', 'Energía', 'Energie'),
    line(
      'What has your natural energy pattern been?',
      '¿Cuál ha sido tu patrón natural de energía?',
      'Wie war dein natürliches Energiemuster?',
    ),
    line('Comes in waves or bursts', 'Llega en olas o ráfagas', 'Kommt in Wellen oder Schüben'),
    line('Focused, driven, or intense', 'Enfocada, impulsada o intensa', 'Fokussiert, angetrieben oder intensiv'),
    line('Steady but slower to start', 'Estable, pero tarda en arrancar', 'Gleichmäßig, aber langsamer im Start'),
  ),
  question(
    'movement-pace',
    line('Movement / pace', 'Movimiento / ritmo', 'Bewegung / Tempo'),
    line(
      'What has your natural pace been?',
      '¿Cuál ha sido tu ritmo natural?',
      'Wie war dein natürliches Tempo?',
    ),
    line('Quick, active, or changeable', 'Rápido, activo o cambiante', 'Schnell, aktiv oder wechselhaft'),
    line('Direct, purposeful, or efficient', 'Directo, con propósito o eficiente', 'Direkt, zielgerichtet oder effizient'),
    line('Steady, grounded, or unhurried', 'Estable, arraigado o sin prisa', 'Stetig, geerdet oder ohne Eile'),
  ),
  question(
    'speech-style',
    line('Speech style', 'Estilo al hablar', 'Sprechstil'),
    line(
      'What is your natural communication style?',
      '¿Cuál es tu estilo natural de comunicación?',
      'Wie ist dein natürlicher Kommunikationsstil?',
    ),
    line('Expressive and quick-moving', 'Expresivo y de ritmo rápido', 'Ausdrucksstark und schnell'),
    line('Clear, direct, and precise', 'Claro, directo y preciso', 'Klar, direkt und genau'),
    line('Calm, warm, and measured', 'Calmo, cálido y mesurado', 'Ruhig, warm und gemessen'),
  ),
  question(
    'learning-style',
    line('Learning style', 'Estilo de aprendizaje', 'Lernstil'),
    line(
      'How have you naturally learned best?',
      '¿Cómo has aprendido mejor de forma natural?',
      'Wie hast du von Natur aus am besten gelernt?',
    ),
    line('Fast, intuitive, and creative', 'Rápido, intuitivo y creativo', 'Schnell, intuitiv und kreativ'),
    line('Analytical, structured, and logical', 'Analítico, estructurado y lógico', 'Analytisch, geordnet und logisch'),
    line('Slow, steady, and lasting', 'Lento, constante y duradero', 'Langsam, stetig und bleibend'),
  ),
  question(
    'memory-pattern',
    line('Memory pattern', 'Patrón de memoria', 'Gedächtnismuster'),
    line(
      'What has your natural memory pattern been?',
      '¿Cuál ha sido tu patrón natural de memoria?',
      'Wie war dein natürliches Gedächtnismuster?',
    ),
    line('Quick to learn, quick to lose', 'Aprendo rápido y lo pierdo rápido', 'Schnell gelernt, schnell verloren'),
    line('Sharp when focused', 'Aguda cuando hay foco', 'Scharf, wenn ich fokussiert bin'),
    line('Slow to learn, long to retain', 'Tardo en aprender y lo retengo mucho', 'Langsam gelernt, lange behalten'),
  ),
  question(
    'emotional-tendency',
    line('Emotional tendency', 'Tendencia emocional', 'Emotionale Neigung'),
    line(
      'What emotion have you naturally leaned toward under strain?',
      '¿Hacia qué emoción has tendido de forma natural bajo presión?',
      'Zu welcher Emotion hast du unter Belastung von Natur aus geneigt?',
    ),
    line('Worry, fear, or overwhelm', 'Preocupación, miedo o agobio', 'Sorge, Angst oder Überforderung'),
    line('Frustration, irritation, or urgency', 'Frustración, irritación o urgencia', 'Frustration, Gereiztheit oder Dringlichkeit'),
    line('Sadness, heaviness, or withdrawal', 'Tristeza, pesadez o retiro', 'Traurigkeit, Schwere oder Rückzug'),
  ),
  question(
    'stress-response',
    line('Stress response', 'Respuesta al estrés', 'Stressreaktion'),
    line(
      'How do you naturally respond to stress?',
      '¿Cómo respondes de forma natural al estrés?',
      'Wie reagierst du von Natur aus auf Stress?',
    ),
    line('I feel scattered or unsettled', 'Me siento disperso o inquieto', 'Ich fühle mich zerstreut oder unruhig'),
    line('I focus on fixing things', 'Me centro en arreglar las cosas', 'Ich konzentriere mich darauf, Dinge zu lösen'),
    line('I withdraw or slow down', 'Me retiro o bajo el ritmo', 'Ich ziehe mich zurück oder werde langsamer'),
  ),
  question(
    'decision-making',
    line('Decision-making', 'Toma de decisiones', 'Entscheidungen'),
    line(
      'What is your natural decision-making style?',
      '¿Cuál es tu estilo natural al decidir?',
      'Wie ist dein natürlicher Entscheidungsstil?',
    ),
    line('I reconsider or change direction', 'Reconsidero o cambio de rumbo', 'Ich überdenke es oder ändere die Richtung'),
    line('I decide firmly with enough facts', 'Decido con firmeza cuando tengo datos', 'Ich entscheide klar, sobald genug Fakten da sind'),
    line('I need time and space', 'Necesito tiempo y espacio', 'Ich brauche Zeit und Raum'),
  ),
  question(
    'social-energy',
    line('Social energy', 'Energía social', 'Soziale Energie'),
    line(
      'What has your natural social energy been?',
      '¿Cómo ha sido tu energía social natural?',
      'Wie war deine natürliche soziale Energie?',
    ),
    line('Engaged, then quickly drained', 'Me implico y me agoto pronto', 'Engagiert, dann schnell erschöpft'),
    line('Energized by meaningful exchange', 'Me da energía un intercambio con sentido', 'Energie durch bedeutsamen Austausch'),
    line('Loyal, familiar, and steady', 'Leal, familiar y estable', 'Loyal, vertraut und beständig'),
  ),
  question(
    'work-rhythm',
    line('Work rhythm', 'Ritmo de trabajo', 'Arbeitsrhythmus'),
    line(
      'What has your natural work rhythm been?',
      '¿Cuál ha sido tu ritmo natural de trabajo?',
      'Wie war dein natürlicher Arbeitsrhythmus?',
    ),
    line('Creative bursts and variety', 'Ráfagas creativas y variedad', 'Kreative Schübe und Abwechslung'),
    line('Goals, standards, and momentum', 'Metas, exigencia e impulso', 'Ziele, Maßstäbe und Schwung'),
    line('Consistency, patience, and follow-through', 'Constancia, paciencia y seguimiento', 'Beständigkeit, Geduld und Dranbleiben'),
  ),
  question(
    'planning-style',
    line('Planning style', 'Estilo de planificación', 'Planungsstil'),
    line(
      'What has your natural planning style been?',
      '¿Cuál ha sido tu estilo natural de planificación?',
      'Wie war dein natürlicher Planungsstil?',
    ),
    line('Flexible, spontaneous, idea-rich', 'Flexible, espontáneo y lleno de ideas', 'Flexibel, spontan und ideenreich'),
    line('Strategic, organized, outcome-focused', 'Estratégico, organizado y orientado al resultado', 'Strategisch, geordnet und ergebnisorientiert'),
    line('Practical, stable, and realistic', 'Práctico, estable y realista', 'Praktisch, stabil und realistisch'),
  ),
  question(
    'routine',
    line('Routine', 'Rutina', 'Tagesroutine'),
    line(
      'What has your natural relationship to routine been?',
      '¿Cuál ha sido tu relación natural con la rutina?',
      'Wie war dein natürliches Verhältnis zur Routine?',
    ),
    line('Helpful, but hard to maintain', 'Útil, pero difícil de mantener', 'Hilfreich, aber schwer durchzuhalten'),
    line('Useful when efficient', 'Útil cuando es eficiente', 'Nützlich, wenn sie effizient ist'),
    line('Comforting and familiar', 'Reconfortante y familiar', 'Beruhigend und vertraut'),
  ),
  question(
    'sensory-sensitivity',
    line('Sensory sensitivity', 'Sensibilidad sensorial', 'Sinnesempfindlichkeit'),
    line(
      'What have you naturally been most sensitive to?',
      '¿A qué has sido más sensible de forma natural?',
      'Wofür warst du von Natur aus am empfindlichsten?',
    ),
    line('Noise, travel, screens, or stimulation', 'Ruido, viajes, pantallas o estímulo', 'Lärm, Reisen, Bildschirme oder Reize'),
    line('Heat, light, conflict, or strong smells', 'Calor, luz, conflicto u olores fuertes', 'Hitze, Licht, Konflikt oder starke Gerüche'),
    line('Dampness, cold, inactivity, or dullness', 'Humedad, frío, inactividad o apatía', 'Feuchtigkeit, Kälte, Untätigkeit oder Dumpfheit'),
  ),
  question(
    'cravings',
    line('Cravings', 'Antojos', 'Gelüste'),
    line(
      'What have you naturally craved when off balance?',
      '¿Qué has anhelado de forma natural cuando estás fuera de balance?',
      'Wonach hat es dich von Natur aus verlangt, wenn du aus dem Gleichgewicht warst?',
    ),
    // Position 1 is Vata even though this option is the grounding one.
    line('Warm, soft, grounding foods', 'Comida cálida, suave y que arraiga', 'Warmes, weiches, erdendes Essen'),
    line('Cooling or refreshing foods', 'Comida fresca o refrescante', 'Kühlendes oder erfrischendes Essen'),
    line('Light, spicy, or energizing foods', 'Comida ligera, especiada o que activa', 'Leichtes, scharfes oder belebendes Essen'),
  ),
  question(
    'cyclical-pattern',
    line('Cyclical pattern', 'Patrón cíclico', 'Wiederkehrendes Muster'),
    line(
      'What recurring body pattern has been most familiar?',
      '¿Qué patrón corporal recurrente te ha resultado más familiar?',
      'Welches wiederkehrende Körpermuster war dir am vertrautesten?',
    ),
    line('Irregular timing or variable symptoms', 'Ritmo irregular o síntomas variables', 'Unregelmäßiger Takt oder wechselnde Symptome'),
    line('Heat, intensity, or inflammation', 'Calor, intensidad o inflamación', 'Hitze, Intensität oder Entzündung'),
    line('Retention, tenderness, or heaviness', 'Retención, sensibilidad o pesadez', 'Einlagerung, Empfindlichkeit oder Schwere'),
  ),
  question(
    'resilience',
    line('Resilience', 'Resiliencia', 'Widerstandskraft'),
    line(
      'What has your natural resilience pattern been?',
      '¿Cuál ha sido tu patrón natural de resiliencia?',
      'Wie war dein natürliches Muster von Widerstandskraft?',
    ),
    line('I deplete quickly with too much input', 'Me agoto rápido con demasiada estimulación', 'Ich leere mich schnell bei zu viel Input'),
    line('I push hard, then burn out', 'Empujo fuerte y luego me quemo', 'Ich drücke stark und brenne dann aus'),
    line('I endure, but can get sluggish', 'Aguanto, pero puedo volverme lento', 'Ich halte aus, kann aber träge werden'),
  ),
  question(
    'warning-signs',
    line('Warning signs', 'Señales de aviso', 'Warnzeichen'),
    line(
      'What is usually your first sign of imbalance?',
      '¿Cuál suele ser tu primera señal de desequilibrio?',
      'Was ist meist dein erstes Zeichen von Ungleichgewicht?',
    ),
    line('Restlessness, bloating, or poor sleep', 'Inquietud, hinchazón o mal sueño', 'Unruhe, Blähungen oder schlechter Schlaf'),
    line('Heat, urgency, or irritability', 'Calor, urgencia o irritabilidad', 'Hitze, Dringlichkeit oder Reizbarkeit'),
    line('Lethargy, congestion, or low motivation', 'Letargo, congestión o poca motivación', 'Trägheit, Stauung oder wenig Antrieb'),
  ),
]
