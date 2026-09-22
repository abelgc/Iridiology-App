/// <reference types="vitest" />
import { describe, it, expect, vi } from 'vitest'
import {
  STANDARD_ANALYSIS_SYSTEM_PROMPT,
  STANDARD_ANALYSIS_SYSTEM_PROMPT_EN,
  COMPARISON_ANALYSIS_SYSTEM_PROMPT,
  TECHNICAL_REVIEW_SYSTEM_PROMPT,
  IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE,
  IRIDOLOGY_IRIS_TERRITORY_MAP,
  IRIDOLOGY_VITAMIN_MINERAL_HERB_MAP,
  IRIDOLOGY_LACUNAE_AND_SIGN_CATALOGUE,
  buildChatSystemPrompt,
  getStandardAnalysisSystemPrompt,
} from '../prompts'
import { REPORT_SECTION_KEYS } from '@/types/report'
import { reportContentSchema } from '@/lib/validators/report'
import { TIER_MODELS } from '@/lib/ai/get-provider'

describe('Claude Prompts', () => {
  describe('IRIDOLOGY_IRIS_TERRITORY_MAP', () => {
    it('maps clock positions for both irises with specific territories', () => {
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('RIGHT IRIS')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('LEFT IRIS')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('12 o\'clock')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('Liver')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('Heart')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('pituitary')
    })

    it('names ANS wreath arc territories with cranial/pituitary depth', () => {
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('ANS WREATH ARC TERRITORIES')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('Upper arc')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('hypothalamus')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('jaw')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('cerebral circulation')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('Lower arc')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('sciatic')
    })

    it('describes zone rings from centre outward', () => {
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('Pupillary zone')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('Collarette')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('Limbus')
    })

    it('REGRESSION (spinal correlation missing, 2026-09-22): the ANS wreath arc territories never map to spinal nerve regions, unlike the Jensen summary\'s §5.13 clock-position-to-spine overlay', () => {
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('SPINAL NERVE CORRELATION')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('cervical nerve')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('thoracic spinal cord')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('lumbar spinal cord')
    })
  })

  describe('IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE', () => {
    it('encodes colour associations, sclera, the meaning law, and the safety boundary', () => {
      const g = IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE
      expect(g).toContain('COLOUR AND FIBRE GUIDE')
      expect(g).toContain('SCLERA')
      expect(g).toContain('chicken-fat')
      expect(g).toContain('Brown')
      expect(g).toContain('Fluorescent orange')
      expect(g).toContain('SAFETY BOUNDARY')
      expect(g).toContain('medical referral')
      // The meaning law:
      expect(g).toContain('never name a colour without')
      // Examples, not a closed list — the AI must interpret any colour it sees:
      expect(g).toContain('not a fixed or exhaustive list')
      expect(g).toContain('ANY colour')
    })

    it('REGRESSION (Jensen reference books, 2026-09-13): reads the four-stage inflammation progression using the palette that matches the iris base colour — brown irides use a yellow-based palette, not a blue-eye vocabulary', () => {
      const g = IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE
      expect(g).toContain('INFLAMMATION STAGE BY BASE IRIS COLOUR')
      expect(g).toContain('very light yellow')
      expect(g).toContain('cloudy yellow')
      expect(g).toContain('dull dark yellow-brown')
      expect(g).toContain('greyish-white')
      expect(g).toContain('not a photography failure')
    })

    it('REGRESSION (Jensen reference books, 2026-09-13): scopes the safety boundary to all eye pathology, not just jaundice, and excludes physical artifacts from iris-sign interpretation', () => {
      const g = IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE
      expect(g).toContain('Iris signs never indicate pathology of the eye itself')
      expect(g).toContain('cataract')
      expect(g).toContain('glaucoma')
      expect(g).toContain('surgical scar')
    })
  })

  describe('IRIDOLOGY_LACUNAE_AND_SIGN_CATALOGUE', () => {
    it("REGRESSION (practitioner's IRIDOLOGY TEXTBOOK notes, 2026-09-12): names specific lacuna shapes with their own clinical meaning, not just generic open/closed lacunae", () => {
      const c = IRIDOLOGY_LACUNAE_AND_SIGN_CATALOGUE
      expect(c).toContain('Asparagus lacuna')
      expect(c).toContain('Roof tile or stair-step lacuna')
      expect(c).toContain('Shoe lacuna')
      expect(c).toContain('Schnabel or beak lacuna')
      expect(c).toContain('Medusa or jellyfish lacuna')
    })

    it('instructs never asserting malignancy or a specific disease from a lacuna shape alone, and never asserts one itself', () => {
      const c = IRIDOLOGY_LACUNAE_AND_SIGN_CATALOGUE
      expect(c).toContain('Never name "cancer", "malignancy", or any specific disease from a lacuna shape alone')
      expect(c).not.toContain('tendency toward malignancy')
      expect(c).not.toContain('possible malignancy')
      expect(c).not.toContain('sign of cancer')
      expect(c).toContain('warranting closer monitoring')
    })

    it('adds named signs the base inventory did not previously interpret: scurf rim, central heterochromia, pinguecula, funnel, cords, defect signs', () => {
      const c = IRIDOLOGY_LACUNAE_AND_SIGN_CATALOGUE
      expect(c).toContain('Scurf rim')
      expect(c).toContain('Central heterochromia')
      expect(c).toContain('Pinguecula')
      expect(c).toContain('Funnel')
      expect(c).toContain('Cords')
      expect(c).toContain('Defect signs')
    })

    it('is woven into the standard analysis prompt as supplementary evidence, alongside the existing catalogues', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('IRIDOLOGY LACUNAE TYPES AND ADDITIONAL SIGNS')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Scurf rim')
    })

    it("REGRESSION (Jensen reference books, 2026-09-13): adds named signs from Jensen's catalogue not previously covered — absorption ring, stomach acidity rings, lymphatic rosary, sodium vs cholesterol ring, venous congestion, bowel wall signs", () => {
      const c = IRIDOLOGY_LACUNAE_AND_SIGN_CATALOGUE
      expect(c).toContain('Absorption ring')
      expect(c).toContain('Overacid stomach ring')
      expect(c).toContain('Underacid stomach ring')
      expect(c).toContain('Lymphatic rosary')
      expect(c).toContain('Sodium ring')
      expect(c).toContain('Cholesterol ring')
      expect(c).toContain('Venous congestion')
      expect(c).toContain('Bowel adhesions')
      expect(c).toContain('Ballooned bowel')
      expect(c).toContain('Bowel stricture')
      expect(c).toContain('Fishhook stomach')
    })

    it('REGRESSION (transversal marking undefined, 2026-09-22): STEP 1 asks the model to inventory "Transversal markings" location and orientation, but the catalogue never defined what one actually is — unlike every other named sign here. Source: docs/reference/iridology-simplified-jensen-summary.md §5.9', () => {
      const c = IRIDOLOGY_LACUNAE_AND_SIGN_CATALOGUE
      expect(c).toContain('Transversal marking')
      expect(c).toContain('cutting across the radial fibre pattern')
      expect(c).toContain('horizontal, vertical, or diagonal')
    })

    it('REGRESSION (radii solaris undefined, 2026-09-22): Jensen summary §5.2 names a specific toxic-bowel sign never carried into the catalogue', () => {
      const c = IRIDOLOGY_LACUNAE_AND_SIGN_CATALOGUE
      expect(c).toContain('Radii solaris')
      expect(c).toContain('spokes on a wheel')
      expect(c).toContain('never evidence of an active infestation')
    })

    it('REGRESSION (nerve ring / cramp ring undefined, 2026-09-22): §5.3 defines a specific stress-ring sign distinct from generic contraction rings, never carried into the catalogue', () => {
      const c = IRIDOLOGY_LACUNAE_AND_SIGN_CATALOGUE
      expect(c).toContain('Nerve ring (cramp ring)')
      expect(c).toContain('buckling or pinching')
      expect(c).toContain('nervous indigestion')
    })

    it('REGRESSION (arcus senilis undefined, 2026-09-22): §5.7 names a specific cerebral-circulation sign never carried into the catalogue', () => {
      const c = IRIDOLOGY_LACUNAE_AND_SIGN_CATALOGUE
      expect(c).toContain('Arcus senilis')
      expect(c).toContain('fuzzy-edged arc')
      expect(c).toContain('never a diagnosis of cerebral pathology')
    })

    it('REGRESSION (psora vs drug deposit undefined, 2026-09-22): §5.11 distinguishes inherited from acquired pigment with different clinical weight, never carried into the catalogue', () => {
      const c = IRIDOLOGY_LACUNAE_AND_SIGN_CATALOGUE
      expect(c).toContain('Psora versus drug or chemical deposit')
      expect(c).toContain('generally inherited pigment patch')
      expect(c).toContain('inheritance-versus-acquisition')
    })

    it('REGRESSION (bowel pocket / diverticulum / spastic colon undefined, 2026-09-22): §5.12 names 3 bowel sub-signs beyond the 4 already covered (adhesions, ballooned, stricture, fishhook), never carried into the catalogue', () => {
      const c = IRIDOLOGY_LACUNAE_AND_SIGN_CATALOGUE
      expect(c).toContain('Bowel pocket')
      expect(c).toContain('Diverticulum')
      expect(c).toContain('Spastic colon')
    })
  })

  describe('STANDARD_ANALYSIS_SYSTEM_PROMPT', () => {
    it('should contain body-first clinical writing directives', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('metabolic processes')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('hormonal regulation')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('elimination pathways')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('nervous system behavior')
    })

    it('allows iris anatomy that supports interpretation', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('anatomy must always SUPPORT')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('INTERPRETATION DISCIPLINE')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).not.toContain('Never describe the iris')
    })

    it('should contain all 13 section keys in JSON format', () => {
      const jsonMatch = STANDARD_ANALYSIS_SYSTEM_PROMPT.match(/{\s*"section_\d+/g)
      expect(jsonMatch).not.toBeNull()

      REPORT_SECTION_KEYS.forEach((key) => {
        expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain(`"${key}"`)
      })
    })

    it('should reference all 13 section names', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('General Terrain')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Emotional Field')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Cognitive')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Immune')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Endocrine')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Circulatory')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Hepatic')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Digestive')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Renal')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Structural')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Detected')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Conclusion')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Strengths of the Body')
    })

    it('should contain clinical history integration rules', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('CLINICAL HISTORY INTEGRATION')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('CONFIRMATION')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('PRECLINICAL SIGN')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('RESTRAINT')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('PRIORITISATION')
    })

    it("REGRESSION (Bhargavi Dasi live run, 2026-08-25): never lets the model tell a client the iris can't confirm or deny a doctor's diagnosis", () => {
      // The old RESTRAINT wording applied "say so explicitly" to ANY patient-reported
      // item with no iris support, with no carve-out for a doctor-confirmed diagnosis —
      // producing "cannot be independently confirmed or denied" about a patient's actual
      // hyperparathyroidism diagnosis on a real run. That reads as the app doubting a
      // doctor, not being honest.
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('subjective symptoms only')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Never apply explicit-absence language to a diagnosis')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('say nothing about that diagnosis at all')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('never a statement that the iris cannot confirm or deny it')
    })

    it('should prohibit mechanistic biochemical language', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT_EN).toContain('PROHIBITED MECHANISTIC LANGUAGE')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT_EN).toContain('Phase I detoxification')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT_EN).toContain('cytochrome P450')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT_EN).toContain('functional outcome')
    })

    it('should require inter-system connections without letting one system monopolise them', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT_EN).toContain('SYSTEM CONNECTIONS')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT_EN).toContain("this section's own primary iris-grounded finding")
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT_EN).toContain('may be named as the causal driver in more than two sections')
    })

    it('contains structural pattern detection and territory mapping pre-analysis phase', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('PRE-ANALYSIS REASONING: STRUCTURAL PATTERN DETECTION AND TERRITORY MAPPING')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('STEP 1 — INVENTORY ALL IRIS PATTERNS')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('STEP 2 — TERRITORY MAPPING')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('STEP 3 — PATTERN-GROUNDED SECTION WRITING')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Pattern and location → Territory → System function → Clinical meaning')
    })

    it('section hierarchy leads with iris pattern and territory', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Key iris pattern(s) and territory')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('drawn from your pre-analysis inventory')
    })

    it('integrates the colour, sclera, and meaning guide', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('COLOUR AND FIBRE GUIDE')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('SCLERA')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('never name a colour without')
    })

    it("REGRESSION (practitioner clinical review, 2026-08-27): requires an internal constitutional assessment step (fibre density + colour family + wreath) before the findings inventory", () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('STEP 0 — CONSTITUTIONAL ASSESSMENT')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('FIBRE DENSITY SCALE')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Mixta o Biliar')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('acquired pigment overlay')
    })

    it('REGRESSION (practitioner clinical review, 2026-08-27): requires an exhaustive lacunae and pigment-spot inventory, not just the dominant finding', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('This inventory must be exhaustive, not illustrative')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('phase indicator')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('persistent intestinal toxic load')
    })

    it('REGRESSION (practitioner clinical review, 2026-08-27): reads ANS wreath shape as an autonomic/stress signal tied to repair capacity', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('protuberant or flowered wreath suggests sympathetic overactivation')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('reparative or healing phase')
    })

    it("REGRESSION (practitioner clinical review, 2026-08-27): requires cross-checking elimination organs before calling them unaffected, and prioritises kidney/intestine detox in the conclusion when a central organ is burdened", () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('ELIMINATION PATHWAY CONSISTENCY')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('decongesting and supporting the kidneys and intestines generally comes first')
    })

    it('REGRESSION (client feedback, 2026-09-01): never declares a chronic-relapsing condition resolved when a current related symptom is reported', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Never declare a historical or chronic-relapsing condition')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('closure language the iris cannot actually verify')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('ongoing constitutional or functional vulnerability')
    })

    it('REGRESSION (client feedback, 2026-09-01): checks for a systemic explanation before writing a dismissive symptom-absence statement', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('check whether a systemic mechanism already identified elsewhere in THIS report')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('downstream expressions of systemic burden')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('state that connection instead of, or alongside, the local absence')
    })

    it("REGRESSION (practitioner feedback, 2026-09-12): emotional field never appends a diagnosis-disclaimer sentence that walks back the finding", () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).not.toContain(
        'Do not present emotional conclusions as iris-confirmed facts unless the iris strongly supports them.'
      )
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Never append a disclaimer or walk-back sentence after the finding')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).not.toContain(
        'Do not present emotional conclusions as iris-confirmed facts unless the iris strongly supports them.'
      )
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('Never append a disclaimer or walk-back sentence after the finding')
    })

    it('REGRESSION (practitioner feedback, 2026-09-12): emotional field writes with the same clinical confidence as every other system, with no special-case hedging', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('emotional field is not a special case that needs extra caution layered on top')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('emotional field is not a special case that needs extra caution layered on top')
    })

    it("REGRESSION (Ana Iranzo real report, 2026-09-13): never lets a section be built around image quality — requires a best-effort reading of whatever is visible instead", () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('PARTIAL VISIBILITY')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('never let the request substitute for the clinical reading itself')
    })

    it("REGRESSION (Ana Iranzo second real report, 2026-09-13): the visibility caveat is allowed once in the whole report, in section_1_general_terrain only — not once per section", () => {
      const p = STANDARD_ANALYSIS_SYSTEM_PROMPT
      expect(p).toContain('earn at most ONE brief mention across the entire report')
      expect(p).toContain('section_1_general_terrain only')
      expect(p).toContain('Reason forward instead')
      // The exact real BAD example from the second report (section_7_hepatic) — still restates
      // the visibility gap instead of reasoning forward from the constitutional finding already
      // on the table:
      expect(p).toContain('not directly exposed in either image, but')
      expect(p).not.toContain('never earn more than a single brief clause per section')
    })

    it("REGRESSION (Jensen reference books, 2026-09-13): a murky/dense brown iris gets Jensen's own difficult-eyes procedure — abstain from guessing the cause, anchor on coarse landmarks first, calibrate darkness per individual", () => {
      const p = STANDARD_ANALYSIS_SYSTEM_PROMPT
      expect(p).toContain('DIFFICULT EYES')
      expect(p).toContain('do not guess at the cause')
      expect(p).toContain('coarse landmarks')
      expect(p).toContain('Calibrate darkness expectations to this individual')
    })

    it('REGRESSION (Jensen reference books, 2026-09-13): requires a corroborating pattern across a system before stating a tendency with confidence, not a single isolated sign', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Corroboration')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('single isolated sign')
    })

    it('REGRESSION (Ana Iranzo third real report, 2026-09-14): an unexposed territory is not treated as an uncorroborated isolated sign — Corroboration must not become a new excuse to restate visibility gaps', () => {
      const p = STANDARD_ANALYSIS_SYSTEM_PROMPT
      expect(p).toContain('an unexposed territory is not an uncorroborated isolated sign')
      expect(p).toContain('without citing the absence as a reason for caution')
    })

    it('REGRESSION (Ana Iranzo third real report, 2026-09-14): DIFFICULT EYES ties directly back to PARTIAL VISIBILITY and bans narrating the difficulty itself, instead of reinforcing a separate "hard case" framing', () => {
      const p = STANDARD_ANALYSIS_SYSTEM_PROMPT
      expect(p).toContain('do not narrate the difficulty as a separate observation')
      expect(p).toContain('not itself something to mention in the output')
      // Old wording that re-primed "difficulty" narration every time this section fired:
      expect(p).not.toContain('patience will be necessary')
      expect(p).not.toContain('Treat a difficult eye as a lower-confidence, more provisional case, not an empty one.')
    })

    it('REGRESSION (Ana Iranzo third real report, 2026-09-14): SECTION DISCIPLINE no longer bans naming multiple concrete visual observations per section, only repetition and anatomy-without-interpretation', () => {
      const p = STANDARD_ANALYSIS_SYSTEM_PROMPT
      expect(p).toContain('Name the concrete visual facts you actually see')
      expect(p).not.toContain('Avoid excessive narration of iris morphology.')
    })

    it('REGRESSION (Ana Iranzo third real report, 2026-09-14): the MEANING LAW requires naming the plain, ordinary colour word (e.g. hazel) alongside any constitutional-family label, not the jargon label alone', () => {
      const g = IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE
      expect(g).toContain('Name the colour in plain, ordinary terms')
      expect(g).toContain('hazel')
      expect(g).toContain('is not a substitute for stating the actual colour observed')
    })

    it('REGRESSION (Jensen reference books, 2026-09-13): excludes physical artifacts (scars, surgical remnants, foreign bodies) from the sign inventory before interpreting anything', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('ARTIFACT EXCLUSION')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('surgical scar')
    })
  })

  describe('COMPARISON_ANALYSIS_SYSTEM_PROMPT', () => {
    it('frames comparison as a practitioner progress review', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('progress review')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('practitioner progress note')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('not a new iris analysis')
    })

    it('evaluates iridological patterns internally before writing', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('INTERNAL EVALUATION')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Hepatic-Biliary Pattern')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Lymphatic-Eliminative Pattern')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Autonomic Nervous System Pattern')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Do not expose this internal checklist in the output')
    })

    it('classifies mobilization as improvement not worsening', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('MOBILIZATION RULE')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('mobilization = IMPROVEMENT')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('peripheral expression')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('scleral vascular activation')
    })

    it('distinguishes structural from functional change velocity', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('STRUCTURAL VS FUNCTIONAL')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Functional patterns')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('stability is expected, not a failure')
    })

    it('emits exactly 2 progress keys and none of the old schema keys', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('"comp_1_improvements"')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('"comp_2_not_improved"')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).not.toContain('"comp_1_trajectory"')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).not.toContain('"comp_2_deteriorations"')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).not.toContain('"section_1_general_terrain"')
    })

    it('bans image-number references and requires natural clinical language', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('IMAGE REFERENCE')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('previous right eye')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('current right eye')
    })

    it('reads iris and sclera colour as evidence', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('COLOUR AND FIBRE GUIDE')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('SCLERA')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).not.toContain('Do not mention iris colour tones')
    })

    it('embeds the iris territory map for zone interpretation depth', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('IRIS TERRITORY MAP')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('pituitary')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('ANS WREATH ARC TERRITORIES')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('jaw')
    })

    it('does not let peripheral mobilization alone close out a chronic-relapsing condition', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Do not declare a chronic-relapsing condition')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('mobilizing or moving toward resolution')
    })
  })

  describe('TECHNICAL_REVIEW_SYSTEM_PROMPT', () => {
    it('should contain review-specific roles', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('VALIDATE')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('QUESTION')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('ADD')
    })

    it('should mention Validation, Questions, and Additional findings structure', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('**Validation**')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('**Questions**')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('**Additional findings**')
    })

    it('should contain structural extraction and interpretation rules', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('STRUCTURAL EXTRACTION')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('INTERPRETATION RULES')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('colleague-to-colleague')
    })

    it('contains interpretation discipline', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('INTERPRETATION DISCIPLINE')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('anatomy must SUPPORT the interpretation')
    })

    it('contains structural pattern detection for independent review', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('PRE-ANALYSIS REASONING: STRUCTURAL PATTERN DETECTION AND TERRITORY MAPPING')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('STEP 1 — INDEPENDENT PATTERN INVENTORY')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('STEP 3 — PATTERN-GROUNDED REVIEW')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('A review finding without a cited iris pattern and territory is an opinion, not a clinical observation')
    })

    it('reads colour+sclera as supporting evidence, not forbidden', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('COLOUR AND FIBRE GUIDE')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('SCLERA')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).not.toContain('Do not mention iris colour tones')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).not.toContain('Prioritise reading these structures over any chromatic observation')
    })

    it('flags overconfident closure language and dismissive absence statements as something to QUESTION', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('declares a condition fully resolved or inactive without iris evidence strong enough')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('systemic mechanism documented elsewhere in the same report')
    })
  })

  describe('buildChatSystemPrompt', () => {
    it('should include report content and patient context', () => {
      const reportContent = 'Test report content'
      const patientContext = 'Test patient context'

      const prompt = buildChatSystemPrompt(reportContent, patientContext)

      expect(prompt).toContain(reportContent)
      expect(prompt).toContain(patientContext)
      expect(prompt).toContain('REPORT:')
      expect(prompt).toContain('PATIENT DATA:')
    })
  })

  describe('reportContentSchema', () => {
    it('should validate correct 13-section objects', () => {
      const validReport: Record<string, string> = {}
      REPORT_SECTION_KEYS.forEach((key) => {
        validReport[key] = `Content for ${key}`
      })

      const result = reportContentSchema.safeParse(validReport)
      expect(result.success).toBe(true)
    })

    it('should reject objects missing sections', () => {
      const invalidReport: Record<string, string> = {
        section_1_general_terrain: 'Content',
        section_2_emotional_field: 'Content',
        // Missing other sections
      }

      const result = reportContentSchema.safeParse(invalidReport)
      expect(result.success).toBe(false)
    })

    it('should reject empty section values', () => {
      const invalidReport: Record<string, string> = {}
      REPORT_SECTION_KEYS.forEach((key) => {
        invalidReport[key] = '' // Empty strings should fail
      })

      const result = reportContentSchema.safeParse(invalidReport)
      expect(result.success).toBe(false)
    })

    it('should have all 14 section keys', () => {
      expect(REPORT_SECTION_KEYS).toHaveLength(14)
      expect(REPORT_SECTION_KEYS[0]).toBe('section_1_general_terrain')
      expect(REPORT_SECTION_KEYS[11]).toBe('section_12_conclusion')
      expect(REPORT_SECTION_KEYS[12]).toBe('section_13_strengths_of_the_body')
      expect(REPORT_SECTION_KEYS[13]).toBe('section_14_recommendations')
    })

    it('IRIDOLOGY_VITAMIN_MINERAL_HERB_MAP shares organ names with the acute/chronic catalogue and excludes shoulder joint', () => {
      expect(IRIDOLOGY_VITAMIN_MINERAL_HERB_MAP).toContain('Liver:')
      expect(IRIDOLOGY_VITAMIN_MINERAL_HERB_MAP).toContain('Vitamins —')
      expect(IRIDOLOGY_VITAMIN_MINERAL_HERB_MAP).toContain('Minerals —')
      expect(IRIDOLOGY_VITAMIN_MINERAL_HERB_MAP).toContain('Herbs —')
      expect(IRIDOLOGY_VITAMIN_MINERAL_HERB_MAP).not.toContain('Shoulder joint:')
    })
  })

  describe('TIER_MODELS', () => {
    it('maps basic_1990 to haiku and gpt-5.6-luna', () => {
      expect(TIER_MODELS.basic_1990.anthropic).toMatch(/haiku/i)
      expect(TIER_MODELS.basic_1990.openai).toBe('gpt-5.6-luna')
    })

    it('maps premium_2990 to sonnet and gpt-5.6-sol', () => {
      expect(TIER_MODELS.premium_2990.anthropic).toMatch(/sonnet/i)
      expect(TIER_MODELS.premium_2990.openai).toBe('gpt-5.6-sol')
    })
  })

  describe('getStandardAnalysisSystemPrompt', () => {
    it('includes a Spanish language directive when lang is es', () => {
      const prompt = getStandardAnalysisSystemPrompt('es')
      expect(prompt).toContain('Spanish')
      expect(prompt).not.toContain('exclusively in English')
    })

    it('includes an English language directive when lang is en', () => {
      const prompt = getStandardAnalysisSystemPrompt('en')
      expect(prompt).toContain('English')
      expect(prompt).not.toContain('exclusively in English')
    })

    it('never contains the hardcoded override phrase for any lang', () => {
      for (const lang of ['en', 'es'] as const) {
        expect(getStandardAnalysisSystemPrompt(lang)).not.toContain(
          'Write ALL report content exclusively in English'
        )
      }
    })

    describe('REGRESSION (Maike Kedher report, 2026-09-21): section_14_recommendations must not stay hardcoded to English prefixes when the rest of the report is in another language', () => {
      it('localizes the three mandatory prefixes for Spanish', () => {
        const p = getStandardAnalysisSystemPrompt('es')
        expect(p).toContain('Vitaminas:')
        expect(p).toContain('Minerales:')
        expect(p).toContain('Hierbas:')
      })

      it('localizes the three mandatory prefixes for German', () => {
        const p = getStandardAnalysisSystemPrompt('de')
        expect(p).toContain('Vitamine:')
        expect(p).toContain('Mineralien:')
        expect(p).toContain('Kräuter:')
      })

      it('keeps the English prefixes for English reports, with no localization note appended', () => {
        const p = getStandardAnalysisSystemPrompt('en')
        expect(p).toContain('"Vitamins:", "Minerals:", "Herbs:"')
        expect(p).not.toContain('use these exact localized prefixes')
      })

      it('explicitly carves out the catalogue item names from translation, to avoid the model improvising a herb/vitamin/mineral name in a different language', () => {
        const p = getStandardAnalysisSystemPrompt('es')
        expect(p).toContain('never translate, substitute, or improvise a translation for a specific supplement or herb name')
      })

      it('instructs the organ header and connecting prose to follow the same language directive as the rest of the report', () => {
        const p = getStandardAnalysisSystemPrompt('es')
        expect(p).toContain('the bold organ header and every other sentence in this section')
      })
    })
  })
})
