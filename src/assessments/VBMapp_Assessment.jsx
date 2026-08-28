import { useState, useCallback, useMemo } from "react";
import { supabase, isConfigured, STORAGE_BUCKET } from "../supabaseClient.js";
import { buildVbmappWordBlob } from "./wordReport_VBMapp.js";
import { buildVbmappXlsxBlob } from "./reportBuilders.js";

// ─────────────────────────────────────────────────────────────────────────────
// VB-MAPP MILESTONES ASSESSMENT — Above & Beyond
// Scoring per milestone: 0 (belum), ½ (parsial), 1 (tercapai)
// Content condensed from the L1/L2/L3 data sheets for scoring use.
// Milestone descriptors are in English (standard VB-MAPP terms); UI is Bahasa.
// ─────────────────────────────────────────────────────────────────────────────

const SCALE = [
  { value: 0,   label: "0",  sub: "Belum",   color: "#E53E3E" },
  { value: 0.5, label: "½",  sub: "Parsial", color: "#D69E2E" },
  { value: 1,   label: "1",  sub: "Tercapai", color: "#38A169" },
];

// Colors follow the standard VB-MAPP Master Scoring Form convention.
// Tes ke-4 has no official color in the standard (rarely reached in practice) — chosen freely.
export const TEST_ROUNDS = [
  { value: 1, label: "Tes ke-1", color: "#FF9900", half: "#FFD89E" },
  { value: 2, label: "Tes ke-2", color: "#9BBB59", half: "#D9E5C0" },
  { value: 3, label: "Tes ke-3", color: "#4F81BD", half: "#BCCFE6" },
  { value: 4, label: "Tes ke-4", color: "#8064A2", half: "#CFC4DC" },
];

// h = half-point criterion, f = full-point criterion (helper text for the scorer)
const LEVELS = [
  {
    id: "L1", label: "Level 1", range: "0–18 bln",
    domains: [
      { code: "Mand", name: "Mand", items: [
        { n: 1, text: "Emits 2 mands with an echoic/imitative prompt (no physical prompts)", h: "1 mand", f: "2 mands" },
        { n: 2, text: "Emits 4 mands without prompts (item and/or ‘What do you want?’ allowed)", h: "2 mands", f: "4 mands" },
        { n: 3, text: "Generalizes 6 mands across 2 people, settings, and examples", h: "3 mands", f: "6 mands" },
        { n: 4, text: "Emits 5 mands in 1 hour (item may be present)", h: "3 mands", f: "5 mands/hr" },
        { n: 5, text: "Emits 10 mands without prompts (item and/or ‘What do you want?’ allowed)", h: "5 mands", f: "10 mands" },
      ]},
      { code: "Tact", name: "Tact", items: [
        { n: 1, text: "Tacts any 2 items (person, pet, character, object; may be part-mand; no echoic prompt)", h: "1 item", f: "2 items" },
        { n: 2, text: "Tacts any 4 items (may be part-mand; no echoic prompt)", h: "2 items", f: "4 items" },
        { n: 3, text: "Tacts 6 non-reinforcing items (no echoic prompt)", h: "3 items", f: "6 items" },
        { n: 4, text: "Spontaneously tacts 2 items during a 60-min observation", h: "1 item", f: "2 items" },
        { n: 5, text: "Tacts 10 items (common objects, body parts, pictures, or people)", h: "5 items", f: "10 items" },
      ]},
      { code: "Listener", name: "Listener Responding", items: [
        { n: 1, text: "Attends to a speaker’s voice by making eye contact 5 times", h: "orients 3×", f: "orients 5×" },
        { n: 2, text: "Responds to hearing his own name 5 times", h: "3×", f: "5×" },
        { n: 3, text: "Looks/touches/points to correct family member, pet, or reinforcer in an array of 2, for 5 reinforcers", h: "3 items", f: "5 items" },
        { n: 4, text: "Performs 4 different motor actions on command without a visual prompt", h: "2 actions", f: "4 actions" },
        { n: 5, text: "Selects correct item from an array of 4, for 20 different objects/pictures", h: "10 items", f: "20 items" },
      ]},
      { code: "VP-MTS", name: "Visual Perceptual / MTS", items: [
        { n: 1, text: "Visually tracks moving stimuli for 2 seconds, 5 times", h: "3×", f: "5×" },
        { n: 2, text: "Grasps small objects with a pincer grasp 5 times", h: "3×", f: "5×" },
        { n: 3, text: "Visually attends to a toy or book for 30 seconds (not a self-stim item)", h: "15 sec", f: "30 sec" },
        { n: 4, text: "Places 3 items in a container / stacks 3 blocks / rings on a peg, for 2 such activities", h: "2 items, 1 activity", f: "2 activities" },
        { n: 5, text: "Matches any 10 identical items (puzzles, toys, objects, pictures)", h: "5 items", f: "10 items" },
      ]},
      { code: "Play", name: "Independent Play", items: [
        { n: 1, text: "Manipulates and explores objects for 1 minute (30-min TO)", h: "30 sec", f: "1 min" },
        { n: 2, text: "Shows variation in play by interacting with 5 different items (30-min TO)", h: "3 items", f: "5 items" },
        { n: 3, text: "Generalizes exploratory play in a novel environment for 2 minutes (30-min TO)", h: "1 min", f: "2 min" },
        { n: 4, text: "Independently engages in movement play for 2 minutes (30-min TO)", h: "1 min", f: "2 min" },
        { n: 5, text: "Independently engages in cause-and-effect play for 2 minutes (30-min TO)", h: "1 min", f: "2 min" },
      ]},
      { code: "Imitation", name: "Motor Imitation", items: [
        { n: 1, text: "Imitates 2 gross motor movements on ‘Do this’", h: "1 action", f: "2 actions" },
        { n: 2, text: "Imitates 4 gross motor movements on ‘Do this’", h: "2 actions", f: "4 actions" },
        { n: 3, text: "Imitates 8 motor movements, 2 of which involve objects", h: "6 (no objects)", f: "8 (2 w/ objects)" },
        { n: 4, text: "Spontaneously imitates the motor behaviors of others on 5 occasions", h: "2 occ.", f: "5 occ." },
        { n: 5, text: "Imitates 20 motor movements of any type", h: "15 movements", f: "20 movements" },
      ]},
      { code: "Social", name: "Social Behavior & Play", items: [
        { n: 1, text: "Makes eye contact as a mand 5 times (30-min TO)", h: "2×", f: "5×" },
        { n: 2, text: "Indicates wanting to be held / physically played with 2 times (60-min TO)", h: "1×", f: "2×" },
        { n: 3, text: "Spontaneously makes eye contact with other children 5 times (60-min TO)", h: "2×", f: "5×" },
        { n: 4, text: "Spontaneously engages in parallel play near other children, 2 min total (30-min TO)", h: "1 min", f: "2 min" },
        { n: 5, text: "Spontaneously follows peers or imitates their motor behavior 2 times (30-min TO)", h: "1×", f: "2×" },
      ]},
      { code: "Echoic", name: "Echoic (EESA)", items: [
        { n: 1, text: "Scores at least 2 on the EESA subtest", h: "1", f: "2" },
        { n: 2, text: "Scores at least 5 on the EESA subtest", h: "3", f: "5" },
        { n: 3, text: "Scores at least 10 on the EESA subtest", h: "7", f: "10" },
        { n: 4, text: "Scores at least 15 on the EESA subtest", h: "12", f: "15" },
        { n: 5, text: "Scores at least 25 on the EESA subtest (≥20 from Group 1)", h: "20 (≥15 Grp 1)", f: "25 (≥15 Grp 1)" },
      ]},
      { code: "Vocal", name: "Spontaneous Vocal", items: [
        { n: 1, text: "Spontaneously emits an average of 5 speech sounds per hour (60-min TO)", h: "avg 2/hr", f: "avg 5/hr" },
        { n: 2, text: "Spontaneously emits 5 different sounds, averaging 10 total sounds/hour (60-min TO)", h: "3 different", f: "5 different" },
        { n: 3, text: "Spontaneously emits 10 different sounds with varying intonation, avg 25/hr (60-min TO)", h: "5 different", f: "10 different" },
        { n: 4, text: "Spontaneously emits 5 different whole-word approximations (60-min TO)", h: "2 words", f: "5 words" },
        { n: 5, text: "Spontaneously vocalizes 15 whole words/phrases with appropriate intonation & rhythm (60-min TO)", h: "8 words", f: "15 words" },
      ]},
    ],
  },
  {
    id: "L2", label: "Level 2", range: "18–30 bln",
    domains: [
      { code: "Mand", name: "Mand", items: [
        { n: 6,  text: "Mands for 20 different missing items without prompts", h: "10 items", f: "20 items" },
        { n: 7,  text: "Mands for 5 actions", h: "3 actions", f: "5 actions" },
        { n: 8,  text: "Emits 5 different 2-word mands (excluding ‘I want’)", h: "3 mands", f: "5 mands" },
        { n: 9,  text: "Spontaneously emits 15 different mands in 30 min (≥2 MOs involved)", h: "8 mands", f: "15 mands" },
        { n: 10, text: "Emits 10 new mands without specific training (may be items trained as tacts/LD)", h: "6 mands", f: "10 mands" },
      ]},
      { code: "Tact", name: "Tact", items: [
        { n: 6,  text: "Tacts 25 items when asked ‘What’s that?’ (1 exemplar each)", h: "20 items", f: "25 items" },
        { n: 7,  text: "Tacts across 3 exemplars of 50 items", h: "2 exemplars each", f: "3 exemplars of 50" },
        { n: 8,  text: "Tacts 10 ongoing actions", h: "5 actions", f: "10 actions" },
        { n: 9,  text: "Tacts 50 two-component verb-noun or noun-verb combinations", h: "25 combos", f: "50 combos" },
        { n: 10, text: "Tacts a total of 200 nouns and/or verbs", h: "150 items", f: "200 items" },
      ]},
      { code: "Listener", name: "Listener Responding", items: [
        { n: 6,  text: "Selects correct item from a messy array of 6, for 40 different objects/pictures", h: "20 items", f: "40 items" },
        { n: 7,  text: "Generalizes LDs in a messy array of 8, for 3 examples of 50 items", h: "2 exemplars of 25", f: "3 examples of 50" },
        { n: 8,  text: "Performs 10 specific motor actions on command", h: "5 actions", f: "10 actions" },
        { n: 9,  text: "Follows 50 two-component noun-verb / verb-noun instructions", h: "25 instr.", f: "50 instr." },
        { n: 10, text: "Selects correct item in a book, picture scene, or NE when named, for 250 items", h: "125 items", f: "250 items" },
      ]},
      { code: "VP-MTS", name: "Visual Perceptual / MTS", items: [
        { n: 6,  text: "Matches identical objects/pictures in a messy array of 6, for 25 items", h: "15 items", f: "25 items" },
        { n: 7,  text: "Sorts similar colors and shapes for 10 colors/shapes given models", h: "5", f: "10" },
        { n: 8,  text: "Matches identical in a messy array of 8 with 3 similar stimuli, for 25 items", h: "15 items", f: "25 items" },
        { n: 9,  text: "Matches non-identical objects/pictures in a messy array of 10, for 25 items", h: "15 items", f: "25 items" },
        { n: 10, text: "Matches non-identical 3D↔2D in a messy array of 10 with 3 similar, for 25 items", h: "15 items", f: "25 items" },
      ]},
      { code: "Play", name: "Independent Play", items: [
        { n: 6,  text: "Searches for a missing/corresponding toy or part of a set, for 5 items/sets", h: "2 sets", f: "5 sets" },
        { n: 7,  text: "Uses toys/objects according to their function, for 5 items", h: "2 items", f: "5 items" },
        { n: 8,  text: "Plays with everyday items in creative ways 2 times", h: "1×", f: "2×" },
        { n: 9,  text: "Independently plays on structures/playground equipment for 5 min total (TO)", h: "2 min", f: "5 min" },
        { n: 10, text: "Assembles multi-part toys for 5 different sets of materials", h: "2 sets", f: "5 sets" },
      ]},
      { code: "Imitation", name: "Motor Imitation", items: [
        { n: 6,  text: "Imitates 10 actions requiring selecting a specific object from an array", h: "6 actions", f: "10 actions" },
        { n: 7,  text: "Imitates 20 different fine motor actions on ‘Do this’", h: "10 actions", f: "20 actions" },
        { n: 8,  text: "Imitates 10 different 3-component action sequences on ‘Do this’", h: "5 two-component", f: "10 three-component" },
        { n: 9,  text: "Spontaneously imitates 5 functional skills in the natural environment", h: "2 skills", f: "5 skills" },
        { n: 10, text: "Imitates any novel motor action (generalized imitative repertoire), w/ & w/o objects", h: "partial", f: "generalized" },
      ]},
      { code: "Social", name: "Social Behavior & Play", disabled: true, items: [
        { n: 6,  text: "Initiates a physical interaction with a peer 2 times (30-min TO)", h: "1×", f: "2×" },
        { n: 7,  text: "Spontaneously mands to peers 5 times (60-min TO)", h: "2×", f: "5×" },
        { n: 8,  text: "Engages in sustained social play with peers, without adult prompts (30-min TO)", h: "2 min", f: "5 min" },
        { n: 9,  text: "Spontaneously responds to mands from peers 5 times", h: "2×", f: "5×" },
        { n: 10, text: "Spontaneously mands to peers to participate in games/social play 2 times (60-min TO)", h: "1×", f: "2×" },
      ]},
      { code: "Echoic", name: "Echoic (EESA)", items: [
        { n: 6,  text: "Scores at least 50 on the EESA subtest (≥20 from Group 2)", h: "40 (≥15 Grp 2)", f: "50 (≥20 Grp 2)" },
        { n: 7,  text: "Scores at least 60 on the EESA subtest", h: "55", f: "60" },
        { n: 8,  text: "Scores at least 70 on the EESA subtest", h: "65", f: "70" },
        { n: 9,  text: "Scores at least 80 on the EESA subtest", h: "75", f: "80" },
        { n: 10, text: "Scores at least 90 on the EESA subtest (≥10 from Groups 4 & 5)", h: "85", f: "90" },
      ]},
      { code: "LRFFC", name: "LRFFC", items: [
        { n: 6,  text: "Selects 5 foods/drinks in an array of 5 (+4 distractors) given ‘You eat…/You drink…’", h: "2 items", f: "5 items" },
        { n: 7,  text: "Selects correct item from an array of 8, for 25 LRFFC fill-in statements", h: "13 items", f: "25 items" },
        { n: 8,  text: "Selects from an array of 10 (or book), for 25 verb-noun LRFFC WH questions", h: "13 items", f: "25 items" },
        { n: 9,  text: "Selects an item given 3 different verbal statements about each, for 25 items", h: "13 items", f: "25 items" },
        { n: 10, text: "Spontaneously tacts the item on 50% of LRFFC trials", h: "25% of trials", f: "50% of trials" },
      ]},
      { code: "IV", name: "Intraverbal", items: [
        { n: 6,  text: "Completes 10 different fill-in-the-blank phrases of any type", h: "5 phrases", f: "10 phrases" },
        { n: 7,  text: "Provides first name when asked ‘What is your name?’", h: "—", f: "provides name" },
        { n: 8,  text: "Completes 25 different fill-in phrases (excluding songs)", h: "13 phrases", f: "25 phrases" },
        { n: 9,  text: "Answers 25 different ‘what’ questions", h: "13 questions", f: "25 questions" },
        { n: 10, text: "Answers 25 different ‘who’ or ‘where’ questions", h: "13 questions", f: "25 questions" },
      ]},
      { code: "Group", name: "Group / Classroom", disabled: true, items: [
        { n: 6,  text: "Sits at group snack/lunch table without negative behaviors for 3 minutes", h: "1 min", f: "3 min" },
        { n: 7,  text: "Puts away items / lines up / comes to table with only 1 verbal prompt", h: "≥2 prompts", f: "1 prompt" },
        { n: 8,  text: "Transitions between classroom activities with ≤1 gestural/verbal prompt", h: "partial", f: "1 prompt" },
        { n: 9,  text: "Sits in a group of 3+ children for 5 min without disruption or leaving", h: "partial", f: "5 min" },
        { n: 10, text: "Sits in a group of 3+ for 10 min, attends 50% of the period, responds to 5 SDs", h: "33% & 2 SDs", f: "50% & 5 SDs" },
      ]},
      { code: "Ling", name: "Linguistic Structure", items: [
        { n: 6,  text: "Articulation of 10 tacts understood by familiar adults who can’t see the item", h: "5 tacts", f: "10 tacts" },
        { n: 7,  text: "Has a total listener vocabulary of 100 words", h: "50 words", f: "100 words" },
        { n: 8,  text: "Emits 10 different 2-word utterances per day of any type (except echoic)", h: "5 utterances", f: "10 utterances" },
        { n: 9,  text: "Emits functional prosody on 5 occasions in one day", h: "2 occ.", f: "5 occ." },
        { n: 10, text: "Has a total speaker vocabulary of 300 words (all operants except echoic)", h: "200 words", f: "300 words" },
      ]},
    ],
  },
  {
    id: "L3", label: "Level 3", range: "30–48 bln",
    domains: [
      { code: "Mand", name: "Mand", items: [
        { n: 11, text: "Spontaneously mands for verbal information with a ‘Wh’ question 5 times in 60 min", h: "3×", f: "5×" },
        { n: 12, text: "Politely mands to stop/remove an aversive activity, for 5 different circumstances", h: "2 circ.", f: "5 circ." },
        { n: 13, text: "Mands with 10 different adjectives, prepositions, or adverbs in 60 min", h: "5", f: "10" },
        { n: 14, text: "Gives directions, instructions, or explanations 5 times", h: "3×", f: "5×" },
        { n: 15, text: "Mands for others to attend to his own verbal behavior ≥5 times", h: "3×", f: "5×" },
      ]},
      { code: "Tact", name: "Tact", items: [
        { n: 11, text: "Tacts color, shape, and function of 5 items", h: "2 features/functions of all 5", f: "all correct" },
        { n: 12, text: "Tacts 4 prepositions and 4 pronouns", h: "4 of either/combined", f: "4 prep. & 4 pron." },
        { n: 13, text: "Tacts 4 different adjectives (excl. colors/shapes) and 4 adverbs", h: "4 of either/combined", f: "4 adj. & 4 adv." },
        { n: 14, text: "Tacts using at least 3 words, 20 times", h: "3 words ×20", f: "4+ words ×20" },
        { n: 15, text: "Tacts at least 1000 non-verbal stimuli", h: "750", f: "1000" },
      ]},
      { code: "Listener", name: "Listener Responding", items: [
        { n: 11, text: "Selects items by color and shape from an array of 6 similar, for 4 colors & 4 shapes", h: "partial", f: "4 colors & 4 shapes" },
        { n: 12, text: "Follows instructions involving 6 prepositions and 4 pronouns", h: "3 prep. & 2 pron. (or one category)", f: "all tested" },
        { n: 13, text: "Selects by 4 pairs of relative adjectives; acts on 4 pairs of relative adverbs", h: "2 pairs each / one category", f: "4 pairs each" },
        { n: 14, text: "Follows 3-step directions for 10 different directions", h: "5", f: "10" },
        { n: 15, text: "Total listener repertoire of 1200 words", h: "600", f: "1200" },
      ]},
      { code: "VP-MTS", name: "Visual Perceptual / MTS", items: [
        { n: 11, text: "Spontaneously matches part of an arts & crafts activity to another’s sample 2 times", h: "1×", f: "2×" },
        { n: 12, text: "Generalized non-identical matching in a messy array of 10 with 3 similar, 25 items (first trial)", h: "15 items", f: "25 items" },
        { n: 13, text: "Completes 20 block designs / parquetry / similar tasks with ≥8 pieces", h: "4-piece designs", f: "8-piece designs" },
        { n: 14, text: "Sorts 5 items from 5 different categories without a model", h: "3 from 3", f: "5 from 5" },
        { n: 15, text: "Continues 20 three-step patterns, sequences, or seriation tasks", h: "20 two-step", f: "20 three-step" },
      ]},
      { code: "Play", name: "Independent Play", items: [
        { n: 11, text: "Spontaneously engages in pretend/imaginary play on 5 occasions", h: "2 occ.", f: "5 occ." },
        { n: 12, text: "Repeats a gross motor behavior to obtain a better effect, for 2 activities", h: "1 activity", f: "2 activities" },
        { n: 13, text: "Independently engages in arts & crafts activities for 5 minutes", h: "2 min", f: "5 min" },
        { n: 14, text: "Independently engages in sustained play for 10 min without prompts/reinforcement", h: "5 min", f: "10 min" },
        { n: 15, text: "Independently draws/writes in pre-academic activity books for 5 minutes", h: "2 min", f: "5 min" },
      ]},
      { code: "Social", name: "Social Behavior & Play", disabled: true, items: [
        { n: 11, text: "Spontaneously cooperates with a peer to accomplish a specific outcome 5 times", h: "2×", f: "5×" },
        { n: 12, text: "Spontaneously mands to peers with a WH question 5 times (60-min TO)", h: "2×", f: "5×" },
        { n: 13, text: "Intraverbally responds to 5 different questions/statements from peers", h: "2×", f: "5×" },
        { n: 14, text: "Engages in pretend social play with peers for 5 min without adult prompts", h: "2 min", f: "5 min" },
        { n: 15, text: "Engages in 4 verbal exchanges on 1 topic, for 5 topics", h: "2 exchanges", f: "4 exchanges ×5 topics" },
      ]},
      { code: "Reading", name: "Reading", items: [
        { n: 11, text: "Attends to a book while a story is read for 75% of the time (3-min TO)", h: "50%", f: "75%" },
        { n: 12, text: "Selects (LDs) the correct uppercase letter from an array of 5, for 10 letters", h: "5 letters", f: "10 letters" },
        { n: 13, text: "Tacts 10 uppercase letters on command", h: "5 letters", f: "10 letters" },
        { n: 14, text: "Reads his own name", h: "—", f: "yes" },
        { n: 15, text: "Matches 5 words to corresponding pictures/items in an array of 5, and vice versa", h: "partial", f: "5 words" },
      ]},
      { code: "Writing", name: "Writing", items: [
        { n: 11, text: "Imitates 5 different writing actions modeled by an adult", h: "3 actions", f: "5 actions" },
        { n: 12, text: "Independently traces within ¼ of the lines of 5 geometrical shapes", h: "3 shapes", f: "5 shapes" },
        { n: 13, text: "Copies 10 letters or numbers legibly", h: "partial", f: "10 legible" },
        { n: 14, text: "Legibly spells and writes his own name without copying", h: "approximates/unclear", f: "legible" },
        { n: 15, text: "Independently copies all 26 uppercase and lowercase letters legibly", h: "approximates/unclear", f: "all legible" },
      ]},
      { code: "LRFFC", name: "LRFFC", items: [
        { n: 11, text: "Selects from an array of 10 with 3 similar stimuli, for 25 WH-question LRFFC tasks", h: "15 tasks", f: "25 tasks" },
        { n: 12, text: "Selects items from a book based on 2 verbal components, for 25 LRFFC tasks", h: "15 tasks", f: "25 tasks" },
        { n: 13, text: "Selects based on 3 verbal components, for 25 WH-question LRFFC tasks", h: "15 tasks", f: "25 tasks" },
        { n: 14, text: "Selects given 4 rotating LRFFC questions about a single topic, for 25 topics", h: "partial", f: "25 topics" },
        { n: 15, text: "Demonstrates 1000 different LRFFC responses (tested/accumulated)", h: "750", f: "1000" },
      ]},
      { code: "IV", name: "Intraverbal", items: [
        { n: 11, text: "Spontaneously emits 20 intraverbal comments (may be part-mand)", h: "10", f: "20" },
        { n: 12, text: "Demonstrates 300 different intraverbal responses (tested/accumulated)", h: "200", f: "300" },
        { n: 13, text: "Answers 2 questions after being read short (15+ word) passages, for 25 passages", h: "partial", f: "25 passages" },
        { n: 14, text: "Describes 25 different events/videos/stories with 8+ words", h: "12 events, 5-word responses", f: "25 events, 8-word responses" },
        { n: 15, text: "Answers 4 different rotating WH questions about a single topic, for 10 topics", h: "3 WH questions × 5 topics", f: "4 WH questions × 10 topics" },
      ]},
      { code: "Group", name: "Group / Classroom", disabled: true, items: [
        { n: 11, text: "Uses the toilet and washes hands with only verbal prompts", h: "requires physical assistance", f: "verbal prompts only" },
        { n: 12, text: "Responds to 5 different group instructions/questions without prompts in a group of 3+", h: "2 instr.", f: "5 instr." },
        { n: 13, text: "Works independently for 5 minutes in a group, staying on task 50% of the period", h: "2 min, 3+ children", f: "5 min, 3+ children" },
        { n: 14, text: "Acquires 2 new behaviors during a 15-min group-teaching format with 5+ children", h: "1 new behavior", f: "2 new behaviors" },
        { n: 15, text: "Sits in a 20-min group of 5 children without disruption and answers 5 intraverbal questions", h: "2 IV questions", f: "5 IV questions" },
      ]},
      { code: "Ling", name: "Linguistic Structure", items: [
        { n: 11, text: "Emits noun inflections: 10 root nouns → plurals and 10 root nouns → possessions", h: "one category only", f: "both" },
        { n: 12, text: "Emits verb inflections: 10 root verbs → past tense and 10 → future tense", h: "one category only", f: "both" },
        { n: 13, text: "Emits 10 different noun phrases with ≥3 words and 2 modifiers", h: "partial", f: "10 phrases" },
        { n: 14, text: "Emits 10 different verb phrases with ≥3 words and 2 modifiers", h: "5 phrases", f: "10 phrases" },
        { n: 15, text: "Combines noun + verb phrases into 10 syntactically correct clauses of ≥5 words", h: "5 clauses", f: "10 clauses" },
      ]},
      { code: "Math", name: "Math", items: [
        { n: 11, text: "Identifies as a listener the numbers 1–5 in an array of 5 different numbers", h: "1–3 in array of 3", f: "1–5 in array of 5" },
        { n: 12, text: "Tacts numbers 1–5", h: "any 3 of 1–5", f: "1–5 mixed order" },
        { n: 13, text: "Counts out 1–5 from a larger set with 1:1 correspondence", h: "counts out 1–3", f: "counts out 1–5" },
        { n: 14, text: "Identifies as a listener 8 different measurement comparisons (more/less, big/little, etc.)", h: "6 comparisons", f: "8 comparisons" },
        { n: 15, text: "Matches written number ↔ quantity for the numbers 1–5", h: "1–3 random order", f: "1–5 random order" },
      ]},
    ],
  },
];

// ── CAPTURE SPEC ──────────────────────────────────────────────────────────────
// How each milestone is recorded, and how filled entries map to the score.
//   count : n short blanks; ½ when h filled, 1 when f filled
//   num   : one number field (tally/EESA score/%/minutes); ½ at h, 1 at f
//   text  : one text field; filled = 1 (e.g. child's own name)
//   yesno : Ya/Tidak; Ya = 1
//   (anything not listed → manual 0/½/1 buttons for qualitative criteria)
const CAP = {
  // L1 Mand
  L1_Mand_1:{m:"count",n:2,h:1,f:2}, L1_Mand_2:{m:"count",n:4,h:2,f:4}, L1_Mand_3:{m:"count",n:6,h:3,f:6}, L1_Mand_4:{m:"count",n:5,h:3,f:5}, L1_Mand_5:{m:"num",h:5,f:10,u:"mand"},
  // L1 Tact
  L1_Tact_1:{m:"count",n:2,h:1,f:2}, L1_Tact_2:{m:"count",n:4,h:2,f:4}, L1_Tact_3:{m:"count",n:6,h:3,f:6}, L1_Tact_4:{m:"count",n:2,h:1,f:2}, L1_Tact_5:{m:"num",h:5,f:10,u:"item"},
  // L1 Listener
  L1_Listener_1:{m:"num",h:3,f:5,u:"×"}, L1_Listener_2:{m:"num",h:3,f:5,u:"×"}, L1_Listener_3:{m:"count",n:5,h:3,f:5}, L1_Listener_4:{m:"count",n:4,h:2,f:4}, L1_Listener_5:{m:"num",h:10,f:20,u:"item"},
  // L1 VP-MTS
  "L1_VP-MTS_1":{m:"num",h:3,f:5,u:"×"}, "L1_VP-MTS_2":{m:"num",h:3,f:5,u:"×"}, "L1_VP-MTS_3":{m:"num",h:15,f:30,u:"detik"}, "L1_VP-MTS_4":{m:"num",h:1,f:2,u:"aktivitas"}, "L1_VP-MTS_5":{m:"num",h:5,f:10,u:"item"},
  // L1 Play
  L1_Play_1:{m:"num",h:30,f:60,u:"detik"}, L1_Play_2:{m:"count",n:5,h:3,f:5}, L1_Play_3:{m:"num",h:1,f:2,u:"menit"}, L1_Play_4:{m:"num",h:1,f:2,u:"menit"}, L1_Play_5:{m:"num",h:1,f:2,u:"menit"},
  // L1 Imitation
  L1_Imitation_1:{m:"count",n:2,h:1,f:2}, L1_Imitation_2:{m:"count",n:4,h:2,f:4}, L1_Imitation_3:{m:"num",h:6,f:8,u:"gerakan"}, L1_Imitation_4:{m:"num",h:2,f:5,u:"kesempatan"}, L1_Imitation_5:{m:"num",h:15,f:20,u:"gerakan"},
  // L1 Social
  L1_Social_1:{m:"num",h:2,f:5,u:"×"}, L1_Social_2:{m:"num",h:1,f:2,u:"×"}, L1_Social_3:{m:"num",h:2,f:5,u:"×"}, L1_Social_4:{m:"num",h:1,f:2,u:"menit"}, L1_Social_5:{m:"num",h:1,f:2,u:"×"},
  // L1 Echoic
  L1_Echoic_1:{m:"num",h:1,f:2,u:"skor EESA"}, L1_Echoic_2:{m:"num",h:3,f:5,u:"skor EESA"}, L1_Echoic_3:{m:"num",h:7,f:10,u:"skor EESA"}, L1_Echoic_4:{m:"num",h:12,f:15,u:"skor EESA"}, L1_Echoic_5:{m:"num",h:20,f:25,u:"skor EESA"},
  // L1 Vocal
  L1_Vocal_1:{m:"num",h:2,f:5,u:"suara/jam"}, L1_Vocal_2:{m:"num",h:3,f:5,u:"suara"}, L1_Vocal_3:{m:"num",h:5,f:10,u:"suara"}, L1_Vocal_4:{m:"num",h:2,f:5,u:"kata"}, L1_Vocal_5:{m:"num",h:8,f:15,u:"kata"},

  // L2 Mand
  L2_Mand_6:{m:"num",h:10,f:20,u:"item"}, L2_Mand_7:{m:"count",n:5,h:3,f:5}, L2_Mand_8:{m:"count",n:5,h:3,f:5}, L2_Mand_9:{m:"num",h:8,f:15,u:"mand"}, L2_Mand_10:{m:"num",h:6,f:10,u:"mand"},
  // L2 Tact
  L2_Tact_6:{m:"num",h:20,f:25,u:"item"}, L2_Tact_8:{m:"num",h:5,f:10,u:"aksi"}, L2_Tact_9:{m:"num",h:25,f:50,u:"kombinasi"}, L2_Tact_10:{m:"num",h:150,f:200,u:"item"},
  // L2 Listener
  L2_Listener_6:{m:"num",h:20,f:40,u:"item"}, L2_Listener_8:{m:"num",h:5,f:10,u:"aksi"}, L2_Listener_9:{m:"num",h:25,f:50,u:"instruksi"}, L2_Listener_10:{m:"num",h:125,f:250,u:"item"},
  // L2 VP-MTS
  "L2_VP-MTS_6":{m:"num",h:15,f:25,u:"item"}, "L2_VP-MTS_7":{m:"num",h:5,f:10,u:"warna/bentuk"}, "L2_VP-MTS_8":{m:"num",h:15,f:25,u:"item"}, "L2_VP-MTS_9":{m:"num",h:15,f:25,u:"item"}, "L2_VP-MTS_10":{m:"num",h:15,f:25,u:"item"},
  // L2 Play
  L2_Play_6:{m:"count",n:5,h:2,f:5}, L2_Play_7:{m:"count",n:5,h:2,f:5}, L2_Play_8:{m:"num",h:1,f:2,u:"×"}, L2_Play_9:{m:"num",h:2,f:5,u:"menit"}, L2_Play_10:{m:"count",n:5,h:2,f:5},
  // L2 Imitation
  L2_Imitation_6:{m:"num",h:6,f:10,u:"aksi"}, L2_Imitation_7:{m:"num",h:10,f:20,u:"aksi"}, L2_Imitation_8:{m:"num",h:5,f:10,u:"urutan"}, L2_Imitation_9:{m:"count",n:5,h:2,f:5},
  // L2 Social
  L2_Social_6:{m:"num",h:1,f:2,u:"×"}, L2_Social_7:{m:"num",h:2,f:5,u:"×"}, L2_Social_8:{m:"num",h:2,f:5,u:"menit"}, L2_Social_9:{m:"num",h:2,f:5,u:"×"}, L2_Social_10:{m:"num",h:1,f:2,u:"×"},
  // L2 Echoic
  L2_Echoic_6:{m:"num",h:40,f:50,u:"skor EESA"}, L2_Echoic_7:{m:"num",h:55,f:60,u:"skor EESA"}, L2_Echoic_8:{m:"num",h:65,f:70,u:"skor EESA"}, L2_Echoic_9:{m:"num",h:75,f:80,u:"skor EESA"}, L2_Echoic_10:{m:"num",h:85,f:90,u:"skor EESA"},
  // L2 LRFFC
  L2_LRFFC_6:{m:"count",n:5,h:2,f:5}, L2_LRFFC_7:{m:"num",h:13,f:25,u:"item"}, L2_LRFFC_8:{m:"num",h:13,f:25,u:"item"}, L2_LRFFC_9:{m:"num",h:13,f:25,u:"item"}, L2_LRFFC_10:{m:"num",h:25,f:50,u:"%"},
  // L2 IV
  L2_IV_6:{m:"num",h:5,f:10,u:"frasa"}, L2_IV_7:{m:"yesno"}, L2_IV_8:{m:"num",h:13,f:25,u:"frasa"}, L2_IV_9:{m:"num",h:13,f:25,u:"pertanyaan"}, L2_IV_10:{m:"num",h:13,f:25,u:"pertanyaan"},
  // L2 Group
  L2_Group_6:{m:"num",h:1,f:3,u:"menit"},
  // L2 Ling
  L2_Ling_6:{m:"num",h:5,f:10,u:"tact"}, L2_Ling_7:{m:"num",h:50,f:100,u:"kata"}, L2_Ling_8:{m:"num",h:5,f:10,u:"ujaran"}, L2_Ling_9:{m:"num",h:2,f:5,u:"kesempatan"}, L2_Ling_10:{m:"num",h:200,f:300,u:"kata"},

  // L3 Mand
  L3_Mand_11:{m:"num",h:3,f:5,u:"×"}, L3_Mand_12:{m:"count",n:5,h:2,f:5}, L3_Mand_13:{m:"num",h:5,f:10,u:"kata"}, L3_Mand_14:{m:"num",h:3,f:5,u:"×"}, L3_Mand_15:{m:"num",h:3,f:5,u:"×"},
  // L3 Tact
  L3_Tact_15:{m:"num",h:750,f:1000,u:"stimuli"},
  // L3 Listener
  L3_Listener_14:{m:"num",h:5,f:10,u:"arahan"}, L3_Listener_15:{m:"num",h:600,f:1200,u:"kata"},
  // L3 VP-MTS
  "L3_VP-MTS_11":{m:"num",h:1,f:2,u:"×"}, "L3_VP-MTS_12":{m:"num",h:15,f:25,u:"item"},
  // L3 Play
  L3_Play_11:{m:"num",h:2,f:5,u:"kesempatan"}, L3_Play_12:{m:"num",h:1,f:2,u:"aktivitas"}, L3_Play_13:{m:"num",h:2,f:5,u:"menit"}, L3_Play_14:{m:"num",h:5,f:10,u:"menit"}, L3_Play_15:{m:"num",h:2,f:5,u:"menit"},
  // L3 Social
  L3_Social_11:{m:"num",h:2,f:5,u:"×"}, L3_Social_12:{m:"num",h:2,f:5,u:"×"}, L3_Social_13:{m:"num",h:2,f:5,u:"×"}, L3_Social_14:{m:"num",h:2,f:5,u:"menit"},
  // L3 Reading
  L3_Reading_11:{m:"num",h:50,f:75,u:"%"}, L3_Reading_12:{m:"num",h:5,f:10,u:"huruf"}, L3_Reading_13:{m:"num",h:5,f:10,u:"huruf"}, L3_Reading_14:{m:"yesno"}, L3_Reading_15:{m:"num",h:3,f:5,u:"kata"},
  // L3 Writing
  L3_Writing_11:{m:"num",h:3,f:5,u:"aksi"}, L3_Writing_12:{m:"num",h:3,f:5,u:"bentuk"}, L3_Writing_13:{m:"num",h:5,f:10,u:"huruf/angka"},
  // L3 LRFFC
  L3_LRFFC_11:{m:"num",h:15,f:25,u:"tugas"}, L3_LRFFC_12:{m:"num",h:15,f:25,u:"tugas"}, L3_LRFFC_13:{m:"num",h:15,f:25,u:"tugas"}, L3_LRFFC_14:{m:"num",h:13,f:25,u:"topik"}, L3_LRFFC_15:{m:"num",h:750,f:1000,u:"respon"},
  // L3 IV
  L3_IV_11:{m:"num",h:10,f:20,u:"komentar"}, L3_IV_12:{m:"num",h:200,f:300,u:"respon"}, L3_IV_13:{m:"num",h:13,f:25,u:"bacaan"}, L3_IV_14:{m:"num",h:12,f:25,u:"peristiwa"}, L3_IV_15:{m:"bank",h:5,f:10},
  // L3 Group
  L3_Group_12:{m:"num",h:2,f:5,u:"instruksi"}, L3_Group_13:{m:"num",h:2,f:5,u:"menit"}, L3_Group_14:{m:"num",h:1,f:2,u:"perilaku"}, L3_Group_15:{m:"num",h:2,f:5,u:"pertanyaan"},
  // L3 Ling
  L3_Ling_13:{m:"num",h:5,f:10,u:"frasa"}, L3_Ling_14:{m:"num",h:5,f:10,u:"frasa"}, L3_Ling_15:{m:"num",h:5,f:10,u:"klausa"},
  // L3 Math
  L3_Math_14:{m:"num",h:6,f:8,u:"perbandingan"},
};

// ── EESA (Early Echoic Skills Assessment — Barbara E. Esch) ───────────────────
// Semua grup: X = bisa (1 poin), kosong = tidak (0 poin). Tidak ada nilai parsial (½).
// Total raw score otomatis mengisi seluruh milestone Echoic (L1 #1–5, L2 #6–10).
const EESA_GROUPS = [
  { id: "G1", name: "Group 1 — Suku kata sederhana & reduplikasi", note: "Target: vokal, diftong, konsonan p, b, m, n, h, w",
    items: ["ah","wow","bee","knee","oo","bye bye","hop","mama","papa","me","one","my","boo","no no","oh","moo","up","may","pop","too","we","boy","wa wa","toy","baa"] },
  { id: "G2", name: "Group 2 — Kombinasi 2 suku kata", note: "Target: tambah konsonan k, g, t, d, f, y, ng",
    items: ["baby","go eat","nighttime","bunny","my foot","yucky","window","funny","meow","kitty","bow wow","mommy","open","oh boy","yumm-o","potty","pay day","pokey","taco","foo-ey","hankie","too bad","cookie","puppy","icky","too hot","monkey","uh-oh","daddy","hot dog"] },
  { id: "G3", name: "Group 3 — Kombinasi 3 suku kata", note: "",
    items: ["tubby toy","banana","fee fi foe","yummy food","daddy up","in a boat","potato","go bye bye","fat doggy","goofy goat","hey me too","my big toe","do high five","oh foo-ey","binky boo","one cookie","open up","peanut hat","tiny pan","peek a boo","teddy bear","doggy bone","funny king","a hiccup","how many","potty time","giddy-up","teepee boat","puppet game"] },
  { id: "G4", name: "Group 4 — Prosodi: frasa lisan", note: "Model: tekankan suku kata bercetak tebal",
    items: ["no WAY","bug-a-BOO","ONE bunny","UH-oh","in a MIN-ute","MY mommy","TAKE it","bow-WOW","my MOM-my","BUG-a-boo"] },
  { id: "G5", name: "Group 5 — Prosodi: konteks lain", note: "",
    items: ["Pitch: menirukan variasi nada 1–2 baris lagu yang dikenal","Pitch: menirukan warble kontinu (sirene OO-oo-OO-oo-OO)","Loudness: menirukan bisikan","Loudness: menirukan suara pelan/keras (bye-bye vs. BYE-BYE)","Duration: menahan “ahh” selama 3 detik secara ekoik"] },
];
const eesaKey = (g, i) => `EESA_${g}_${i}`;
function eesaGroupScore(eesa, g) {
  return g.items.reduce((s, _, i) => s + (eesa[eesaKey(g.id, i)] === "x" ? 1 : 0), 0);
}
const eesaTotal = eesa => EESA_GROUPS.reduce((s, g) => s + eesaGroupScore(eesa, g), 0);

// ── ITEM BANKS (dari data sheet — tap item yang berhasil) ─────────────────────
const TACT50 = ["Apple","Cookies","Bird","Cat","Airplane","Car","Shoes","Shirt","Chair","Bed","Ball","Spoon","Cup","Flower","Bicycle","Banana","Pizza","Ice Cream","Cow","Fish","Hat","Clock","Keys","Scissors","TV","Computer","Bowl","Balloons","Blocks","Table","Back Pack","Cake","Cereal","Candy","Lion","Bus","Pretzels","Pig","Dog","Truck","Fire Truck","Bubbles","Chips","Puzzle","Elephant","Crayons","Paint","Socks","Pants","Train"];
const ACTIONS10 = ["Clapping","Jumping","Sneezing","Sleeping","Crying","Blowing","Dancing","Waving","Coughing","Knocking"];
const VERBNOUN50 = ["Ball Rolling","Ball Bouncing","Throwing Ball","Catching Ball","Kicking Ball","Cutting Paper","Stacking Blocks","Coloring Paper","Writing Letters/Words","Reading Book","Knocking on Table","Knocking on Door","Clapping Hands","Opening Mouth","Blowing Bubbles","Wiping Table","Pouring Juice","Drinking Juice","Eating Chips","Opening Box","Closing Drawer","Tying Shoe","Brushing Teeth","Washing Face","Brushing Hair","baby sleeping","girl running","man jumping","people dancing","man waving","push the swing","go down the slide","climb the ladder","shoot the ball","go across the monkey bars","baby crying","boy swimming","girl singing","man skating","dog riding a bike","pig rolling in mud","laying an egg","riding a horse","swimming dolphin","dog jumping","stir a bowl","grill food","slice/cut bread","bake in the oven","wash clothes"];
const LISTENER40 = ["ball","bed","bike","boat","bowl","box","bus","car","cat","chair","cow","crayon","cup","pig","pizza","plane","plate","scissors","shoe","spaghetti","spoon","dog","elephant","fish","fork","grapes","horse","house","ice cream","ipad","numbers","paper","pencil","sun","swing","table","tennis ball","toothbrush","trampoline","truck/turtle"];
const MOTOR10 = ["Clapping","Jumping","Sneezing","Sleeping","Crying","Blowing","Dancing","Waving","Coughing","Knocking","smile","open mouth","give me five","give hug","stomp feet"];

const BANKS = {
  L2_Tact_6: TACT50,
  L2_Tact_8: ACTIONS10,
  L2_Tact_9: VERBNOUN50,
  L2_Listener_6: LISTENER40,
  L2_Listener_8: MOTOR10,
  L2_Listener_9: VERBNOUN50,
  L2_IV_8: ["You sit on a… (chair/couch)","You drink from a… (cup/straw)","You eat with a… (fork/spoon)","You color with a… (crayon/marker)","You go potty in the… (toilet)","You see with your… (eyes)","You eat with your… (mouth)","You smell with your… (nose)","You ride a/in a… (bike/car/bus)","You wear… (clothes/pjs)","You wear socks and… (shoes)","You play with… (toy/game)","You read a… (book)","You watch a/the… (movie)","You write with a… (pencil)","You sleep in a… (bed)","You listen to… (music)","You wash with… (soap/water)","You brush your teeth with a… (toothbrush)","You brush your hair with a… (hairbrush)","You tell time with a… (clock/watch)","You build with… (blocks/legos)","You carry things in a… (bag)","You dry off with a… (towel)","You cut with… (scissors/knife)"],
  L2_IV_9: ["What do you like to eat?","What do you like to drink?","What animal do you like?","What do you sit on?","What do you read?","What do you swing on?","What do you blow?","What do you wear on feet?","What do you slide down?","What do you see in the sky?","What brush teeth with?","What is in bathroom?","What is in bedroom?","What do you play with?","What do you color with?","What do you cut with?","What do you ride in?","What do you sleep in?","What do you paint with?","What do you draw on?","What do you do with soap?","What do you eat on?","What do you wear in cold?","What do you wear in hot?","What wash hands with?"],
  L2_IV_10: ["Who helps when sick?","Who helps at school?","Who's your teacher?","Who says Ho, Ho, Ho?","Who drives the bus?","Who flies in space?","Who cuts hair?","Who puts out fires?","Who flies airplanes?","Who collects garbage?","Who do you play with?","Who do you see at school?","Who delivers the mail?","Who cooks dinner?","Who drives the train?","Where do you go to sleep?","Where do you eat?","Where are clouds?","Where do you see animals?","Where do you buy food?","Where do you read?","Where do fish live?","Where do you swing?","Where do you keep food cold?","Where do you swim?"],
  L2_LRFFC_6: ["spaghetti","cookie","banana","milk","juice"],
  L2_LRFFC_7: ["You read a… (book)","You write with a… (pencil)","You watch a… (tv)","You swing on a… (swing)","You wash your hands in a… (sink)","You cook on a… (stove)","You sleep in a… (bed)","You eat… (spaghetti)","You sit on a… (chair)","You brush your teeth with a… (toothbrush)","You drive a… (car)","You fly in an… (airplane)","You bounce a… (ball/basketball)","You ride a… (bike)","You eat with… (fork/spoon)","You jump on a… (trampoline)","You listen to… (music)","You wear… on your feet (shoes)","You drink from a… (cup)","You drive on a… (road)","A … swims in the water (fish)","You wash clothes in a… (washer)","You live in a… (house)","You play or type on a… (computer)"],
  L2_LRFFC_8: ["Who can fly? (bird)","Which one barks? (dog)","Who can swim? (swimmer)","Which one oinks? (pig)","Who can help when sick? (doctor)","What do you wear? (coat)","What do you ride? (bike)","Which one swims? (fish/dolphin)","Who puts out fires? (fireman)","Which one roars? (lion)","Which one do you sit on? (chair)","Who goes to the moon? (astronaut)","Which one stings? (bee)","What do you throw trash in? (trash can)","What grows outside? (tree)","Who slithers on the ground? (snake)","Which one do you kick? (soccer ball)","What plays music? (guitar)","What do you sweep with? (broom)","Which one can jump? (rabbit)","Which one do you sit at? (table)","Who helps you paint? (painter)","Who gives you mail? (mailman)","What do you drink from? (cup)","Which one has a refrigerator? (kitchen)"],
  L2_LRFFC_9: ["airplane","apple","ball","banana","bike","bird","book","broccoli","car","cat","chicken","cookie","couch","cow","cup","dog","door","duck","fire","fish","frog","grapes","house","ice cream","juice"],
  L2_Imitation_6: ["Roll marker across table","Bring cup to mouth","Tap table with spoon","Hug toy animal","Tap table with marker","Bring spoon to mouth","Take cap off marker","Push a car","Make toy animal walk","Turn cup over"],
  L2_Imitation_7: ["wiggle fingers","make a fist","isolate index finger to point","pinch play-dough","hold up 2 fingers","push button (on toy)","squeeze toy","make rabbit ears","hold up 3 fingers","thumbs up","make “ok” sign","hold up 5 fingers","ASL “L” shape","ASL “C” shape","fold hands together"],
  L2_Imitation_8: ["stand up, clap, jump","touch head, shoulders, knees","raise hand, nod yes, stand up","touch eyes, ears, nose","touch knees, toes, clap","raise hand, jump, clap","scribble on paper, put in cup, stand","knock on table, touch nose, clap hands","jump, clap hands, touch head","stomp feet, shake head no, arms up"],
  L2_Imitation_9: ["use napkin","put on coat","wash hands","put materials away","remove shoes"],
  L3_Listener_11: ["Blue Whale","Triangle sign","Brown Pants","Circular Pumpkin","Green Car","Red Heart","Yellow Lemon","Star"],
  L3_Listener_12: ["stand behind the chair","stand next to the chair","stand in front of the chair","put block in cup","put block under the cup","put pencil on the desk","put pencil in the desk","touch my hand","touch your ear","give him high five","give her high five","point to my nose","point to her/his nose","point to the shoes that are mine"],
  L3_Listener_13: ["big/little","dirty/clean","hot/cold","old/new","fast/slow","louder/softer","early/late","swiftly/lazily/quickly"],
  L3_Listener_14: ["clap hands, pat legs, touch toes","stand up, stomp feet, clap hands","sit, touch nose, raise hand","jump, sit down, touch your head","touch your toes, clap your hands, pat your belly","touch your head, shoulder, knees","go to the sink, wash your hands, come back","stand up, push chair in, walk to the door","get a towel, wipe the table, throw away","give me five, clap hands, stand/sit"],
  L3_Tact_11: ["basketball","stop sign","ice cream cone","apple","refrigerator"],
  "L3_VP-MTS_14": ["foods","vehicles","animals"],
  L3_Reading_15: ["two","bird","pig","ball","dog"],
  L3_LRFFC_12: ["Which animal says moo?","Which one flies?","What animal jumps?","Who says “baaa”?","What animal has spots?","Which animal barks / can be a pet?","What animal is yellow?","What animal meows?","Who lives in the jungle?","Who lives in a cave?","What do you use to color?","Which one helps you cut?","What would you use to sharpen a pencil?","Where is the drawing of a soccer ball?","What do you use to help erase?","What do you use to paint with?","What do you write on?","Which one do you use to glue things with?","Where is the black chalkboard?","Which one is a picture?","What do you use to brush hair?","What do you take pictures with?","Which one do you wear on your eyes?","What do you write with?","What do you use to buy things with?"],
  L3_LRFFC_13: ["Which animal is gray and swims?","Which animal is blue and yellow and swims?","What has wheels and you can ride?","What is pink and erases pencil marks?","Where is the tall man mopping?","Where are the colorful blocks stacked?","Which fruit can you drink?","What green fruit grows on trees?","What is brown and tall you sit at?","Find the white paper you write on?","Where are the blue pants you wear?","Which animal is brown and roars?","Where is the man who puts out fires?","Where is the yellow animal that buzzes?","Where is the tea in the cup with leaves?","Where is the brown animal that meows?","Where are the stack of books to read?","What is long with a brush used to paint?","Where is the woman who helps when sick?","What juice do you drink that comes from an apple?","What is orange with stripes that roars?","What animal is black and white and barks?","What animal has wings and flies?","What is pink and you wear in the cold?","What has a net you shoot a basketball through?"],
  L3_IV_15: ["School","Farm","Home","Zoo","Ocean","Family","Sports","Games","Food","Pets"],
};

// ── CONTOH / NOTES (dari komentar reviewer: “tambah notes”) ───────────────────
const EX = {
  L2_Tact_8: "ex: clapping, jumping",
  L2_Tact_9: "ex: throwing ball, man jumping",
  L2_Listener_9: "ex: knock the door, kick the ball",
  L2_IV_8: "ex: You sit on a …",
  L2_Imitation_8: "ex: stand up – clap – jump",
  L2_Play_6: "ex: puzzle piece, ball for a drop-in toy, bottle for a baby doll",
  L2_Play_8: "ex: uses a bowl as a drum, a box as an imaginary car",
  L2_Play_10: "ex: Mr. Potato Head, Little People sets, Cootie Bugs, K'Nex",
  L2_Imitation_9: "ex: eating with a spoon, putting on a coat, removing shoes",
  L2_LRFFC_10: "ex: says “dog” diberi pernyataan “find an animal” + array berisi gambar anjing",
  L3_Tact_12: "ex: on, his",
  L3_Tact_13: "ex: big, fast",
  L3_Listener_14: "ex: jump, sit down, touch your head",
  "L3_VP-MTS_11": "ex: teman mewarnai balon merah, anak menyalin warna merah pada balonnya",
  L3_Ling_11: "ex: dog vs. dogs · dog's collar vs. cat's collar",
  L3_Ling_12: "ex: played (lampau) · will play (akan)",
  L3_Ling_13: "ex: He's my puppet. I want chocolate ice cream.",
  L3_Ling_14: "ex: Push me hard. Go up the steps.",
  L3_Ling_15: "ex: The dog licked my face.",
  L3_IV_15: "ex: Who takes you to school? Where do you go to school? What do you take to school?",
  L3_LRFFC_15: "Catat pada skills tracking sheet terpisah (akumulasi).",
};

// ── SCORING HELPERS ──────────────────────────────────────────────────────────
const keyFor = (levelId, code, n) => `${levelId}_${code}_${n}`;
const isEchoic = code => code === "Echoic";
function getCap(levelId, code, n) {
  const k = keyFor(levelId, code, n);
  if (BANKS[k]) { const c = CAP[k] || {}; return { m: "bank", items: BANKS[k], h: c.h, f: c.f }; }
  return CAP[k] || { m: "manual" };
}

function capScore(cap, v) {
  switch (cap.m) {
    case "bank": {
      const n = Array.isArray(v) ? v.length : 0;
      return n >= cap.f ? 1 : n >= cap.h ? 0.5 : 0;
    }
    case "count": {
      const filled = (Array.isArray(v) ? v : []).filter(x => String(x).trim() !== "").length;
      return filled >= cap.f ? 1 : filled >= cap.h ? 0.5 : 0;
    }
    case "num": {
      const x = parseFloat(v);
      if (isNaN(x)) return 0;
      return x >= cap.f ? 1 : x >= cap.h ? 0.5 : 0;
    }
    case "text":  return String(v || "").trim() !== "" ? 1 : 0;
    case "yesno": return v === "ya" ? 1 : 0;
    default:      return typeof v === "number" ? v : 0; // manual
  }
}
function capAnswered(cap, v) {
  switch (cap.m) {
    case "bank":  return Array.isArray(v) && v.length > 0;
    case "count": return Array.isArray(v) && v.some(x => String(x).trim() !== "");
    case "num":   return v != null && v !== "" && !isNaN(parseFloat(v));
    case "text":  return String(v || "").trim() !== "";
    case "yesno": return v === "ya" || v === "tidak";
    default:      return typeof v === "number";
  }
}
function capDisplay(cap, v) {
  switch (cap.m) {
    case "bank":  return Array.isArray(v) && v.length ? `${v.length} item: ${v.join(", ")}` : "-";
    case "count": { const f = (Array.isArray(v) ? v : []).filter(x => String(x).trim() !== ""); return f.length ? f.join(", ") : "-"; }
    case "num":   return v != null && v !== "" ? `${v} ${cap.u || ""}`.trim() : "-";
    case "text":  return v ? v : "-";
    case "yesno": return v === "ya" ? "Ya" : v === "tidak" ? "Tidak" : "-";
    default:      return "-";
  }
}

// Echoic milestones are derived from the EESA total, not entered by hand.
function scoreOf(levelId, code, item, scores, eesa) {
  if (isEchoic(code)) {
    const cap = CAP[keyFor(levelId, code, item.n)] || {};
    const t = eesaTotal(eesa || {});
    if (!Object.keys(eesa || {}).length) return 0;
    return t >= cap.f ? 1 : t >= cap.h ? 0.5 : 0;
  }
  return capScore(getCap(levelId, code, item.n), scores[keyFor(levelId, code, item.n)]);
}
function answeredOf(levelId, code, item, scores, eesa) {
  if (isEchoic(code)) return Object.keys(eesa || {}).length > 0;
  return capAnswered(getCap(levelId, code, item.n), scores[keyFor(levelId, code, item.n)]);
}

// isItemInvalid: per-milestone manual "tidak dapat diuji" flag, keyed the same
// way as `scores` (levelId_code_n). Structural exclusion (Social/Group L2 & L3)
// stays on `domain.disabled` and is separate — that always applies to everyone.
const isItemInvalid = (levelId, code, n, invalidItems) => !!(invalidItems && invalidItems[keyFor(levelId, code, n)]);
const itemExcluded = (levelId, domain, item, invalidItems) => domain.disabled || isItemInvalid(levelId, domain.code, item.n, invalidItems);

function domainItems(levelId, domain, invalidItems) {
  if (domain.disabled) return [];
  return domain.items.filter(it => !isItemInvalid(levelId, domain.code, it.n, invalidItems));
}
function domainTotal(scores, levelId, domain, eesa, invalidItems) {
  return domainItems(levelId, domain, invalidItems).reduce((sum, it) => sum + scoreOf(levelId, domain.code, it, scores, eesa), 0);
}
function domainMax(levelId, domain, invalidItems) {
  return domainItems(levelId, domain, invalidItems).length;
}
function levelTotal(scores, level, eesa, invalidItems) {
  return level.domains.reduce((sum, d) => sum + domainTotal(scores, level.id, d, eesa, invalidItems), 0);
}
function levelMax(level, invalidItems) {
  return level.domains.reduce((sum, d) => sum + domainMax(level.id, d, invalidItems), 0);
}
function domainComplete(scores, levelId, domain, eesa, invalidItems) {
  return domain.items.every(it => isItemInvalid(levelId, domain.code, it.n, invalidItems) || answeredOf(levelId, domain.code, it, scores, eesa));
}
function grandMax(invalidItems) {
  return LEVELS.reduce((s, lv) => s + levelMax(lv, invalidItems), 0);
}
const GRAND_MAX_FULL = LEVELS.reduce((s, lv) => s + levelMax(lv, {}), 0); // before any manual exclusions

const scoreColor = s => (s >= 1 ? "#38A169" : s >= 0.5 ? "#D69E2E" : "#E53E3E");
const scoreLabel = s => (s >= 1 ? "1" : s >= 0.5 ? "½" : "0");

// ── SMALL COMPONENTS ──────────────────────────────────────────────────────────
function ScoreButton({ opt, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: "10px 4px",
        border: selected ? `2px solid ${opt.color}` : "1.5px solid #CBD5E0",
        borderRadius: 8,
        background: selected ? opt.color : "#fff",
        color: selected ? "#fff" : "#4A5568",
        cursor: "pointer", transition: "all 0.15s",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 0,
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{opt.label}</span>
      <span style={{ fontSize: 10, lineHeight: 1.1 }}>{opt.sub}</span>
    </button>
  );
}

function ScoreBadge({ answered, score }) {
  if (!answered) return <span style={{ marginLeft: "auto", color: "#CBD5E0", fontSize: 12, fontWeight: 700 }}>—</span>;
  return (
    <span style={{ marginLeft: "auto", background: scoreColor(score), color: "#fff", borderRadius: 6, padding: "3px 11px", fontSize: 13, fontWeight: 800 }}>
      {scoreLabel(score)}
    </span>
  );
}

const fieldStyle = { padding: "8px 10px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 13, color: "#2D3748", boxSizing: "border-box" };

function MilestoneInput({ levelId, code, item, scores, setScore, eesa, goEesa }) {
  const cap = getCap(levelId, code, item.n);
  const k = keyFor(levelId, code, item.n);
  const v = scores[k];
  const answered = capAnswered(cap, v);
  const score = capScore(cap, v);

  // Echoic is computed from the EESA checklist
  if (isEchoic(code)) {
    const c = CAP[k] || {};
    const t = eesaTotal(eesa || {});
    const has = Object.keys(eesa || {}).length > 0;
    const s = !has ? 0 : t >= c.f ? 1 : t >= c.h ? 0.5 : 0;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F7FAFC", border: "1px dashed #CBD5E0", borderRadius: 8, padding: "10px 12px" }}>
        <span style={{ fontSize: 12, color: "#4A5568" }}>Otomatis dari EESA — skor saat ini <b>{t}</b></span>
        <button onClick={goEesa} style={{ marginLeft: 4, background: "#EBF8FF", color: "#2B6CB0", border: "1.5px solid #90CDF4", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Buka EESA →</button>
        <ScoreBadge answered={has} score={s} />
      </div>
    );
  }

  if (cap.m === "bank") {
    const sel = Array.isArray(v) ? v : [];
    const toggle = x => setScore(k, sel.includes(x) ? sel.filter(y => y !== x) : [...sel, x]);
    return (
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {cap.items.map(x => {
            const on = sel.includes(x);
            return (
              <span key={x} onClick={() => toggle(x)}
                style={{ padding: "6px 11px", borderRadius: 16, fontSize: 12, lineHeight: 1.3, cursor: "pointer", userSelect: "none",
                  border: on ? "1.5px solid #2B6CB0" : "1.5px solid #CBD5E0", background: on ? "#2B6CB0" : "#fff", color: on ? "#fff" : "#4A5568", fontWeight: on ? 600 : 400 }}>
                {x}
              </span>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 8, fontSize: 11, color: "#A0AEC0" }}>
          Terpilih <b style={{ color: "#2B6CB0", margin: "0 3px" }}>{sel.length}</b> / {cap.items.length}
          <ScoreBadge answered={answered} score={score} />
        </div>
      </div>
    );
  }

  if (cap.m === "count") {
    const arr = Array.isArray(v) ? v : [];
    const filled = arr.filter(x => String(x).trim() !== "").length;
    return (
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Array.from({ length: cap.n }).map((_, i) => (
            <input key={i} value={arr[i] || ""} placeholder={`${i + 1}`}
              onChange={e => { const nx = [...arr]; nx[i] = e.target.value; setScore(k, nx); }}
              style={{ ...fieldStyle, flex: "1 1 96px", minWidth: 84 }} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "#A0AEC0" }}>Terisi {filled} / {cap.n}</span>
          <ScoreBadge answered={answered} score={score} />
        </div>
      </div>
    );
  }
  if (cap.m === "num") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input type="number" inputMode="numeric" value={v ?? ""} onChange={e => setScore(k, e.target.value)}
          style={{ ...fieldStyle, width: 120, fontSize: 14 }} />
        <span style={{ fontSize: 12, color: "#718096" }}>{cap.u}</span>
        <ScoreBadge answered={answered} score={score} />
      </div>
    );
  }
  if (cap.m === "text") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input value={v ?? ""} placeholder={cap.u} onChange={e => setScore(k, e.target.value)}
          style={{ ...fieldStyle, flex: 1, fontSize: 14 }} />
        <ScoreBadge answered={answered} score={score} />
      </div>
    );
  }
  if (cap.m === "yesno") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {[["ya", "Ya"], ["tidak", "Tidak"]].map(([val, lbl]) => (
          <button key={val} onClick={() => setScore(k, val)}
            style={{ padding: "9px 20px", borderRadius: 8, border: v === val ? "2px solid #2B6CB0" : "1.5px solid #CBD5E0", background: v === val ? "#2B6CB0" : "#fff", color: v === val ? "#fff" : "#4A5568", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {lbl}
          </button>
        ))}
        <ScoreBadge answered={answered} score={score} />
      </div>
    );
  }
  // manual (qualitative "as shown" / partial criteria)
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {SCALE.map(opt => (
        <ScoreButton key={opt.value} opt={opt} selected={v === opt.value} onClick={() => setScore(k, opt.value)} />
      ))}
    </div>
  );
}

// ── MILESTONES GRID (VB-MAPP master scoring form) ─────────────────────────────
// 16 skill areas across the x-axis (fixed positions), milestones 1–15 up the
// y-axis. Cells greyed where a domain has no milestone at that level.
export const GRID_COLS = [
  "Mand", "Tact", "Listener", "VP-MTS", "Play", "Social",
  "Imitation", "Echoic", "Vocal", "LRFFC", "IV", "Group",
  "Ling", "Reading", "Writing", "Math",
];
export const GRID_ROWS = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
export const levelOf = n => (n <= 5 ? "L1" : n <= 10 ? "L2" : "L3");
export const BAND_TINT = { L1: "#EBF8FF", L2: "#FEFCBF", L3: "#FED7D7" };

// Lightweight structural summary of LEVELS (no item text/CAP data) so the
// Dashboard can reconstruct which domains exist per level without importing
// the full milestone dataset.
export const LEVELS_META = LEVELS.map(lv => ({
  id: lv.id, label: lv.label, range: lv.range,
  domains: lv.domains.map(d => ({ code: d.code, disabled: !!d.disabled })),
}));

function gridCell(code, n, scores, eesa, invalidItems) {
  const lid = levelOf(n);
  const lv = LEVELS.find(l => l.id === lid);
  const dom = lv && lv.domains.find(d => d.code === code);
  const item = dom && dom.items.find(it => it.n === n);
  if (!item) return { exists: false };
  if (itemExcluded(lid, dom, item, invalidItems)) return { exists: true, disabled: true };
  return {
    exists: true,
    score: scoreOf(lid, code, item, scores, eesa),
    answered: answeredOf(lid, code, item, scores, eesa),
  };
}

function MilestoneGrid({ scores, roundFull, roundHalf, eesa, invalidItems }) {
  const CELL = 26, LABEL = 30, HEAD = 78;
  const HATCH = "repeating-linear-gradient(45deg,#F7FAFC,#F7FAFC 3px,#EDF2F7 3px,#EDF2F7 6px)";
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {/* Y-axis title */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: 11, fontWeight: 700, color: "#718096", letterSpacing: 1 }}>MILESTONE</span>
      </div>

      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", flex: 1 }}>
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: LABEL, height: HEAD }} />
              {GRID_COLS.map(code => (
                <th key={code} style={{ width: CELL, height: HEAD, verticalAlign: "bottom", padding: 0 }}>
                  <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: 10, fontWeight: 700, color: "#4A5568", margin: "0 auto 4px", whiteSpace: "nowrap" }}>{code}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GRID_ROWS.map(n => (
              <tr key={n}>
                <td style={{ width: LABEL, textAlign: "center", fontSize: 11, fontWeight: 700, color: "#4A5568", background: BAND_TINT[levelOf(n)], border: "1px solid #E2E8F0" }}>{n}</td>
                {GRID_COLS.map(code => {
                  const c = gridCell(code, n, scores, eesa, invalidItems);
                  let bg = "#fff";
                  if (!c.exists) bg = "#E2E8F0";                       // not assessed at this level
                  else if (c.disabled) bg = HATCH;                     // excluded domain
                  else if (c.answered && c.score >= 1) bg = roundFull; // full
                  else if (c.answered && c.score >= 0.5) bg = roundHalf; // half
                  return (
                    <td key={code} title={c.exists && !c.disabled ? `${code} ${n}: ${c.answered ? c.score : "—"}` : c.disabled ? `${code} ${n}: dikecualikan` : ""}
                      style={{ width: CELL, height: CELL, border: c.disabled ? "1px dashed #CBD5E0" : "1px solid #E2E8F0", background: bg }} />
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={GRID_COLS.length + 1} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#718096", letterSpacing: 1, paddingTop: 6 }}>
                AREA KETERAMPILAN (DOMAIN)
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// storage moved to Supabase (see supabaseClient.js)

export default function VBMappAssessment() {
  const [tab, setTab] = useState("client");          // client | L1 | L2 | L3 | summary
  const [domainIdx, setDomainIdx] = useState(0);      // index within active level

  const [client, setClient] = useState({
    nama: "", noClient: "", usia: "", tanggalLahir: "",
    jenisKelamin: "", diagnosis: "", asesor: "", tanggalAsesmen: "",
  });
  const [testRound, setTestRound] = useState(1);
  const [scores, setScores] = useState({});
  const [eesa, setEesa] = useState({});
  const [invalidItems, setInvalidItems] = useState({}); // { "L1_Social_1": true }
  const [notes, setNotes] = useState({});
  const [kesimpulan, setKesimpulan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  const [xlsxError, setXlsxError] = useState("");

  const setScore = useCallback((k, v) => setScores(prev => ({ ...prev, [k]: v })), []);
  const toggleItemInvalid = useCallback((levelId, code, n) => setInvalidItems(prev => {
    const key = keyFor(levelId, code, n);
    const next = { ...prev };
    if (next[key]) delete next[key]; else next[key] = true;
    return next;
  }), []);
  const setEesaCell = useCallback((g, i, v) => setEesa(prev => {
    const key = eesaKey(g, i);
    const next = { ...prev };
    if (prev[key] === v) delete next[key]; else next[key] = v; // tap again to clear
    return next;
  }), []);

  const grandTotal = useMemo(
    () => LEVELS.reduce((s, lv) => s + levelTotal(scores, lv, eesa, invalidItems), 0),
    [scores, eesa, invalidItems]
  );
  const GRAND_MAX = useMemo(() => grandMax(invalidItems), [invalidItems]);
  const roundColor = TEST_ROUNDS.find(r => r.value === testRound)?.color || "#2B6CB0";
  const roundHalf = TEST_ROUNDS.find(r => r.value === testRound)?.half || "#BEE3F8";

  // ── REPORT ──────────────────────────────────────────────────────────────────
  function generateReport() {
    const date = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
    const L = [];
    L.push("ABOVE & BEYOND — VB-MAPP MILESTONES ASSESSMENT");
    L.push("============================================================");
    L.push(`Tanggal Cetak : ${date}`);
    L.push(`Tes ke-       : ${testRound}`);
    L.push("");
    L.push("DATA KLIEN");
    L.push(`Nama          : ${client.nama}`);
    L.push(`No. Client    : ${client.noClient}`);
    L.push(`Usia          : ${client.usia}`);
    L.push(`Tanggal Lahir : ${client.tanggalLahir}`);
    L.push(`Jenis Kelamin : ${client.jenisKelamin}`);
    L.push(`Diagnosis     : ${client.diagnosis}`);
    L.push(`Asesor        : ${client.asesor}`);
    L.push(`Tgl. Asesmen  : ${client.tanggalAsesmen}`);
    L.push("");
    L.push("REKAP SKOR PER LEVEL");
    L.push("------------------------------------------------------------");
    LEVELS.forEach(lv => {
      L.push(`${lv.label} (${lv.range})  ${levelTotal(scores, lv, eesa, invalidItems)} / ${levelMax(lv, invalidItems)}`);
      lv.domains.forEach(d => {
        if (d.disabled) { L.push(`   ${d.name.padEnd(26)}   -- (dikecualikan dari penilaian)`); return; }
        L.push(`   ${d.name.padEnd(26)} ${String(domainTotal(scores, lv.id, d, eesa, invalidItems)).padStart(4)} / ${domainMax(lv.id, d, invalidItems)}`);
      });
    });
    L.push("------------------------------------------------------------");
    L.push(`TOTAL MILESTONES : ${grandTotal} / ${GRAND_MAX}`);
    L.push("");
    L.push("EARLY ECHOIC SKILLS ASSESSMENT (EESA)");
    L.push("------------------------------------------------------------");
    EESA_GROUPS.forEach(g => L.push(`   ${g.name.padEnd(42)} ${eesaGroupScore(eesa, g)}`));
    L.push(`   TOTAL RAW SCORE (Groups 1-5)                     ${eesaTotal(eesa)}`);
    L.push("");
    L.push("DETAIL PER MILESTONE");
    L.push("============================================================");
    LEVELS.forEach(lv => {
      L.push("");
      L.push(`### ${lv.label} — ${lv.range}`);
      lv.domains.forEach(d => {
        if (d.disabled) { L.push(`\n${d.code} — ${d.name}  [DIKECUALIKAN — tidak dinilai untuk semua client]`); return; }
        L.push(`\n${d.code} — ${d.name}  [${domainTotal(scores, lv.id, d, eesa, invalidItems)}/${domainMax(lv.id, d, invalidItems)}]`);
        d.items.forEach(it => {
          if (isItemInvalid(lv.id, d.code, it.n, invalidItems)) { L.push(`  ${String(it.n).padStart(2)}. (—)  ${it.text}  [TIDAK DAPAT DIUJI]`); return; }
          const sc = scoreOf(lv.id, d.code, it, scores, eesa);
          const data = isEchoic(d.code) ? `Skor EESA: ${eesaTotal(eesa)}` : capDisplay(getCap(lv.id, d.code, it.n), scores[keyFor(lv.id, d.code, it.n)]);
          L.push(`  ${String(it.n).padStart(2)}. (${sc})  ${it.text}`);
          if (data && data !== "-") L.push(`       ↳ ${data}`);
        });
        const note = notes[`${lv.id}_${d.code}`];
        if (note) L.push(`  Catatan: ${note}`);
      });
    });
    L.push("");
    L.push("============================================================");
    L.push("KESIMPULAN & REKOMENDASI KLINIS");
    L.push("============================================================");
    L.push(kesimpulan || "(Belum diisi)");
    L.push("");
    L.push(`Dicetak oleh: ${client.asesor}  |  ${date}`);
    L.push("Above & Beyond Child Development Center — Medan");

    const blob = new Blob([L.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VBMapp_${(client.nama || "klien").replace(/\s+/g, "_")}_Tes${testRound}_${client.tanggalAsesmen || date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── EXCEL EXPORT (colored pyramid grid, matches the on-screen Rekap) ─────────
  // Requires the "exceljs" package: npm i exceljs
  // NOTE: this only runs in a real deployed build — the Claude.ai artifact
  // preview does not have "exceljs" installed, so this button will error out
  // there. Test it once the .jsx is running in your own hosted app.
  const argb = hex => "FF" + hex.replace("#", "").toUpperCase();

  function buildXlsxCfg() {
    return {
      client, testRound, roundColor, roundHalf,
      GRID_COLS, GRID_ROWS, levelOf, BAND_TINT,
      cell: (code, n) => gridCell(code, n, scores, eesa, invalidItems),
      eesaGroups: EESA_GROUPS.map(g => ({ name: g.name, score: eesaGroupScore(eesa, g) })),
      eesaTotal: eesaTotal(eesa),
      levels: LEVELS.map(lv => ({
        id: lv.id, label: lv.label, range: lv.range,
        total: levelTotal(scores, lv, eesa, invalidItems),
        max: levelMax(lv, invalidItems),
        domains: lv.domains.map(d => ({
          code: d.code, name: d.name, disabled: !!d.disabled,
          items: d.items.map(it => ({
            n: it.n, text: it.text,
            invalid: isItemInvalid(lv.id, d.code, it.n, invalidItems),
            score: scoreOf(lv.id, d.code, it, scores, eesa),
            answered: answeredOf(lv.id, d.code, it, scores, eesa),
            data: isEchoic(d.code) ? eesaTotal(eesa) : capDisplay(getCap(lv.id, d.code, it.n), scores[keyFor(lv.id, d.code, it.n)]),
          })),
        })),
      })),
      grandTotal, grandMax: GRAND_MAX, kesimpulan,
    };
  }

  async function downloadExcel() {
    setXlsxBusy(true);
    setXlsxError("");
    try {
      const cfg = buildXlsxCfg();
      const blob = await buildVbmappXlsxBlob(cfg);
      const dateStr = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `VBMapp_${(client.nama || "klien").replace(/\s+/g, "_")}_Tes${testRound}_${client.tanggalAsesmen || dateStr}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setXlsxError("Gagal membuat file Excel: " + (err && err.message ? err.message : "unknown"));
    } finally {
      setXlsxBusy(false);
    }
  }

  async function downloadWordReport() {
    setWordBusy(true);
    setXlsxError("");
    try {
      const cfg = {
        client, testRound,
        eesaGroups: EESA_GROUPS.map(g => ({ name: g.name, score: eesaGroupScore(eesa, g) })),
        eesaTotal: eesaTotal(eesa),
        levels: LEVELS.map(lv => ({
          id: lv.id, label: lv.label, range: lv.range,
          total: levelTotal(scores, lv, eesa, invalidItems),
          max: levelMax(lv, invalidItems),
          domains: lv.domains.map(d => ({
            code: d.code, name: d.name, disabled: !!d.disabled,
            items: d.items.map(it => ({
              n: it.n, text: it.text,
              invalid: isItemInvalid(lv.id, d.code, it.n, invalidItems),
              score: scoreOf(lv.id, d.code, it, scores, eesa),
              data: isEchoic(d.code) ? eesaTotal(eesa) : capDisplay(getCap(lv.id, d.code, it.n), scores[keyFor(lv.id, d.code, it.n)]),
            })),
          })),
        })),
        grandTotal, grandMax: GRAND_MAX, kesimpulan,
      };
      const blob = await buildVbmappWordBlob(cfg);
      const dateStr = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `VBMapp_Laporan_${(client.nama || "klien").replace(/\s+/g, "_")}_Tes${testRound}_${client.tanggalAsesmen || dateStr}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setXlsxError("Gagal membuat laporan Word: " + (err && err.message ? err.message : "unknown"));
    } finally {
      setWordBusy(false);
    }
  }

  // ── SUBMIT ──────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitting(true); setSubmitError("");
    const row = {
      timestamp: new Date().toISOString(),
      testRound,
      ...client,
    };
    // flat, sheet-friendly keys: L1_Mand_1 ... plus per-domain + per-level totals
    row.eesa_total = eesaTotal(eesa);
    EESA_GROUPS.forEach(g => { row[`EESA_${g.id}_total`] = eesaGroupScore(eesa, g); });
    LEVELS.forEach(lv => {
      lv.domains.forEach(d => {
        if (d.disabled) {
          row[`${lv.id}_${d.code}_total`] = "dikecualikan";
          return;
        }
        d.items.forEach(it => {
          const kk = keyFor(lv.id, d.code, it.n);
          if (isItemInvalid(lv.id, d.code, it.n, invalidItems)) { row[kk] = "tidak_dapat_diuji"; row[`${kk}_data`] = ""; return; }
          row[kk] = scoreOf(lv.id, d.code, it, scores, eesa);
          row[`${kk}_data`] = isEchoic(d.code) ? eesaTotal(eesa) : capDisplay(getCap(lv.id, d.code, it.n), scores[kk]);
        });
        row[`${lv.id}_${d.code}_total`] = domainTotal(scores, lv.id, d, eesa, invalidItems);
        row[`${lv.id}_${d.code}_catatan`] = notes[`${lv.id}_${d.code}`] || "";
      });
      row[`${lv.id}_total`] = levelTotal(scores, lv, eesa, invalidItems);
    });
    row.grand_total = grandTotal;
    row.grand_max = GRAND_MAX;
    row.kesimpulan = kesimpulan;

    try {
      if (!isConfigured) throw new Error("Supabase belum dikonfigurasi (isi src/supabaseClient.js).");

      // Build the same Excel report the download button produces, and store it
      // so every entry has a downloadable file, same as OT.
      let filePath = "";
      try {
        const blob = await buildVbmappXlsxBlob(buildXlsxCfg());
        const safe = (client.nama || "klien").replace(/[^\w\-]+/g, "_");
        filePath = `VBMAPP/${safe}_${Date.now()}.xlsx`;
        const up = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, blob, {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: false,
        });
        if (up.error) filePath = ""; // non-fatal: keep the row even if the file fails
      } catch (fileErr) {
        filePath = "";
      }

      const { error } = await supabase.from("assessments").insert({
        type: "VBMAPP",
        client_name: client.nama || null,
        client_no: client.noClient || null,
        usia: client.usia || null,
        jenis_kelamin: client.jenisKelamin || null,
        diagnosis: client.diagnosis || null,
        asesor: client.asesor || null,
        assessment_date: client.tanggalAsesmen || null,
        test_round: testRound || null,
        total_score: grandTotal ?? null,
        max_score: GRAND_MAX ?? null,
        kesimpulan: kesimpulan || null,
        data: row,
        file_path: filePath || null,
      });
      if (error) throw error;
      generateReport();
      setSubmitted(true);
    } catch (e) {
      // Local report should not be held hostage by a failed save.
      generateReport();
      setSubmitError("Laporan (.txt) tetap terdownload, tapi gagal menyimpan ke database: " + (e && e.message ? e.message : "unknown"));
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setClient({ nama: "", noClient: "", usia: "", tanggalLahir: "", jenisKelamin: "", diagnosis: "", asesor: "", tanggalAsesmen: "" });
    setScores({}); setEesa({}); setInvalidItems({}); setNotes({}); setKesimpulan(""); setTestRound(1);
    setSubmitted(false); setSubmitError(""); setTab("client"); setDomainIdx(0);
  }

  // ── SUBMITTED ─────────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", background: "#F7FAFC", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 48, maxWidth: 480, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1A202C", marginBottom: 8 }}>Asesmen Tersimpan</h2>
          <p style={{ color: "#718096", marginBottom: 8 }}>Data {client.nama} (Tes ke-{testRound}) berhasil disimpan ke database.</p>
          <p style={{ color: "#A0AEC0", fontSize: 13, marginBottom: 24 }}>Laporan sudah terdownload — upload ke folder Drive klien.</p>
          <button onClick={resetForm} style={{ background: "#2B6CB0", color: "#fff", border: "none", borderRadius: 8, padding: "12px 32px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Asesmen Baru</button>
        </div>
      </div>
    );
  }

  const activeLevel = LEVELS.find(l => l.id === tab);
  const activeDomain = activeLevel ? activeLevel.domains[Math.min(domainIdx, activeLevel.domains.length - 1)] : null;

  // ── MAIN LAYOUT ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#EBF4FF", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#2B6CB0", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#BEE3F8", fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Above & Beyond</div>
          <div style={{ color: "#fff", fontSize: 17, fontWeight: 700, marginTop: 2 }}>VB-MAPP Milestones Assessment</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ background: roundColor, borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 12, fontWeight: 700 }}>Tes ke-{testRound}</div>
          {client.nama && <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "6px 14px", color: "#fff", fontSize: 13, fontWeight: 600 }}>{client.nama}</div>}
        </div>
      </div>

      {/* Main tab bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E2E8F0", overflowX: "auto", display: "flex", padding: "0 8px", WebkitOverflowScrolling: "touch" }}>
        {[{ id: "client", label: "📋 Data Klien" }, { id: "eesa", label: "🔊 EESA" }, ...LEVELS.map(l => ({ id: l.id, label: l.label })), { id: "summary", label: "📊 Rekap" }].map(t => {
          const active = tab === t.id;
          const lvl = LEVELS.find(l => l.id === t.id);
          return (
            <button key={t.id}
              onClick={() => { setTab(t.id); setDomainIdx(0); }}
              style={{ padding: "11px 16px", border: "none", borderBottom: active ? "3px solid #2B6CB0" : "3px solid transparent", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 700, color: active ? "#2B6CB0" : "#718096", whiteSpace: "nowrap", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span>{t.label}</span>
              {t.id === "eesa" && <span style={{ fontSize: 10, fontWeight: 600, color: active ? "#2B6CB0" : "#A0AEC0" }}>{eesaTotal(eesa)}</span>}
              {lvl && <span style={{ fontSize: 10, fontWeight: 600, color: active ? "#2B6CB0" : "#A0AEC0" }}>{levelTotal(scores, lvl, eesa, invalidItems)}/{levelMax(lvl, invalidItems)}</span>}
            </button>
          );
        })}
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 48px" }}>

        {/* ── CLIENT TAB ── */}
        {tab === "client" && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A202C", marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #E2E8F0" }}>Data Klien</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                { key: "nama", label: "Nama Anak", full: true },
                { key: "noClient", label: "No. Client" },
                { key: "usia", label: "Usia" },
                { key: "tanggalLahir", label: "Tanggal Lahir", type: "date" },
                { key: "jenisKelamin", label: "Jenis Kelamin", options: ["Laki-laki", "Perempuan"] },
                { key: "asesor", label: "Asesor" },
                { key: "tanggalAsesmen", label: "Tanggal Asesmen", type: "date" },
                { key: "diagnosis", label: "Diagnosis / Alasan Rujukan", full: true },
              ].map(field => (
                <div key={field.key} style={{ gridColumn: field.full ? "1 / -1" : "auto" }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A5568", marginBottom: 6 }}>{field.label}</label>
                  {field.options ? (
                    <select value={client[field.key]} onChange={e => setClient(p => ({ ...p, [field.key]: e.target.value }))}
                      style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, color: "#2D3748", background: "#fff" }}>
                      <option value="">Pilih...</option>
                      {field.options.map(o => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type={field.type || "text"} value={client[field.key]} onChange={e => setClient(p => ({ ...p, [field.key]: e.target.value }))}
                      style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, color: "#2D3748", boxSizing: "border-box" }} />
                  )}
                </div>
              ))}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A5568", marginBottom: 6 }}>Tes ke- (menentukan warna pada grid)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {TEST_ROUNDS.map(r => (
                    <button key={r.value} onClick={() => setTestRound(r.value)}
                      style={{ flex: 1, padding: "10px", borderRadius: 8, border: testRound === r.value ? `2px solid ${r.color}` : "1.5px solid #CBD5E0", background: testRound === r.value ? r.color : "#fff", color: testRound === r.value ? "#fff" : "#4A5568", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 24, textAlign: "right" }}>
              <button onClick={() => { setTab("L1"); setDomainIdx(0); }}
                style={{ background: "#2B6CB0", color: "#fff", border: "none", borderRadius: 8, padding: "11px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Mulai Asesmen →</button>
            </div>
          </div>
        )}

        {/* ── EESA TAB ── */}
        {tab === "eesa" && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A202C" }}>Early Echoic Skills Assessment (EESA)</h2>
              <span style={{ fontSize: 12, color: "#A0AEC0" }}>Barbara E. Esch, Ph.D., BCBA, CCC-SLP</span>
            </div>
            <div style={{ background: "#FFF7ED", border: "1px solid #FEC89A", borderRadius: 8, padding: "10px 14px", margin: "12px 0 18px", fontSize: 12, color: "#7C2D12", lineHeight: 1.5 }}>
              Tap <b>X</b> = bisa (1 poin). Kosongkan = tidak bisa (0 poin). Tidak ada nilai parsial.<br />
              Skor ini otomatis mengisi seluruh milestone <b>Echoic</b> pada Level 1 (#1–5) dan Level 2 (#6–10).
            </div>

            {EESA_GROUPS.map(g => (
              <div key={g.id} style={{ marginBottom: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: "#2B6CB0" }}>{g.name}</h3>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#4A5568" }}>{eesaGroupScore(eesa, g)} / {g.items.length}</span>
                </div>
                {g.note && <div style={{ fontSize: 11, color: "#A0AEC0", fontStyle: "italic", marginBottom: 8 }}>{g.note}</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {g.items.map((word, i) => {
                    const v = eesa[eesaKey(g.id, i)];
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, background: v ? "#F7FBFF" : "transparent" }}>
                        <span style={{ fontSize: 13, color: "#2D3748", flex: 1 }}>{word}</span>
                        <button onClick={() => setEesaCell(g.id, i, "x")}
                          style={{ width: 30, height: 26, borderRadius: 6, fontSize: 12, fontWeight: 800, cursor: "pointer",
                            border: v === "x" ? "1.5px solid #38A169" : "1.5px solid #CBD5E0", background: v === "x" ? "#38A169" : "#fff", color: v === "x" ? "#fff" : "#A0AEC0" }}>X</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div style={{ background: "#2B6CB0", borderRadius: 10, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Total Raw Score (Groups 1–5)</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{eesaTotal(eesa)}</span>
            </div>
          </div>
        )}

        {/* ── LEVEL TABS ── */}
        {activeLevel && activeDomain && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
            {/* Domain sub-tabs */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12, marginBottom: 16, borderBottom: "1px solid #E2E8F0", WebkitOverflowScrolling: "touch" }}>
              {activeLevel.domains.map((d, i) => {
                const active = i === domainIdx;
                const disabled = d.disabled;
                const complete = !disabled && domainComplete(scores, activeLevel.id, d, eesa, invalidItems);
                return (
                  <button key={d.code} onClick={() => setDomainIdx(i)}
                    style={{ padding: "6px 12px", borderRadius: 20, border: active ? "1.5px solid #2B6CB0" : "1.5px solid #E2E8F0", background: disabled ? "#F7FAFC" : active ? "#EBF8FF" : "#fff", color: disabled ? "#CBD5E0" : active ? "#2B6CB0" : "#718096", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
                    {d.code}
                    {disabled ? <span style={{ fontSize: 10 }}>⊘</span> : <span style={{ fontSize: 10, color: complete ? "#38A169" : "#CBD5E0" }}>{complete ? "✓" : "•"}</span>}
                  </button>
                );
              })}
            </div>

            {activeDomain.disabled ? (
              <div style={{ background: "#F7FAFC", border: "1.5px dashed #CBD5E0", borderRadius: 10, padding: "28px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>⊘</div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#4A5568", margin: "0 0 6px" }}>{activeDomain.name} — Tidak Dinilai</h2>
                <p style={{ fontSize: 13, color: "#A0AEC0", maxWidth: 420, margin: "0 auto" }}>
                  Domain ini dikecualikan dari asesmen untuk semua client. Total skor dan skor maksimum level secara otomatis disesuaikan.
                </p>
              </div>
            ) : (<>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#2B6CB0", letterSpacing: 1, textTransform: "uppercase" }}>{activeLevel.label} · {activeDomain.code}</span>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1A202C", margin: "2px 0 0" }}>{activeDomain.name}</h2>
              </div>
              <div style={{ background: "#EBF8FF", borderRadius: 8, padding: "4px 12px", fontSize: 13, fontWeight: 700, color: "#2B6CB0" }}>
                {domainTotal(scores, activeLevel.id, activeDomain, eesa, invalidItems)} / {domainMax(activeLevel.id, activeDomain, invalidItems)}
              </div>
            </div>

            <div style={{ background: "#EBF8FF", borderRadius: 8, padding: "8px 14px", margin: "12px 0 20px", fontSize: 12, color: "#2C5282" }}>
              <strong>Skor:</strong> 0 = belum &nbsp;·&nbsp; ½ = parsial &nbsp;·&nbsp; 1 = tercapai
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {activeDomain.items.map((it, i) => {
                const exNote = EX[keyFor(activeLevel.id, activeDomain.code, it.n)];
                const invalid = isItemInvalid(activeLevel.id, activeDomain.code, it.n, invalidItems);
                return (
                  <div key={it.n} style={{ paddingBottom: 18, borderBottom: i < activeDomain.items.length - 1 ? "1px solid #F7FAFC" : "none" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 13, color: "#2D3748", lineHeight: 1.5, fontWeight: 500 }}>
                        <span style={{ color: "#A0AEC0", fontWeight: 700, marginRight: 8 }}>{it.n}.</span>{it.text}
                      </div>
                      <button onClick={() => toggleItemInvalid(activeLevel.id, activeDomain.code, it.n)}
                        style={{ flex: "none", background: invalid ? "#EDF2F7" : "#fff", color: invalid ? "#4A5568" : "#CBD5E0", border: "1.5px solid #E2E8F0", borderRadius: 6, padding: "3px 9px", fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        ⊘ {invalid ? "Ditandai" : "Tidak dapat diuji"}
                      </button>
                    </div>
                    {invalid ? (
                      <div style={{ background: "#F7FAFC", border: "1px dashed #CBD5E0", borderRadius: 8, padding: "10px 12px", marginLeft: 22, fontSize: 12, color: "#A0AEC0" }}>
                        Milestone ini ditandai tidak dapat diuji untuk client ini — tidak dihitung dalam skor.
                      </div>
                    ) : (<>
                      <div style={{ fontSize: 11, color: "#A0AEC0", marginBottom: exNote ? 3 : 10, paddingLeft: 22 }}>
                        ½ = {it.h} &nbsp;·&nbsp; 1 = {it.f}
                      </div>
                      {exNote && <div style={{ fontSize: 11, color: "#B7791F", marginBottom: 10, paddingLeft: 22, fontStyle: "italic" }}>{exNote}</div>}
                      <MilestoneInput levelId={activeLevel.id} code={activeDomain.code} item={it} scores={scores} setScore={setScore}
                        eesa={eesa} goEesa={() => { setTab("eesa"); }} />
                    </>)}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#718096", marginBottom: 6 }}>Catatan Klinis — {activeDomain.code} (opsional)</label>
              <textarea value={notes[`${activeLevel.id}_${activeDomain.code}`] || ""} rows={2}
                onChange={e => setNotes(p => ({ ...p, [`${activeLevel.id}_${activeDomain.code}`]: e.target.value }))}
                placeholder="Observasi klinis untuk domain ini..."
                style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 13, color: "#2D3748", resize: "vertical", boxSizing: "border-box" }} />
            </div>
            </>)}

            {/* Domain nav */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
              <button onClick={() => {
                if (domainIdx > 0) setDomainIdx(domainIdx - 1);
                else { const li = LEVELS.findIndex(l => l.id === activeLevel.id); if (li === 0) setTab("client"); else { setTab(LEVELS[li - 1].id); setDomainIdx(LEVELS[li - 1].domains.length - 1); } }
              }} style={{ background: "#EDF2F7", color: "#4A5568", border: "none", borderRadius: 8, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>← Sebelumnya</button>
              <button onClick={() => {
                if (domainIdx < activeLevel.domains.length - 1) setDomainIdx(domainIdx + 1);
                else { const li = LEVELS.findIndex(l => l.id === activeLevel.id); if (li === LEVELS.length - 1) setTab("summary"); else { setTab(LEVELS[li + 1].id); setDomainIdx(0); } }
              }} style={{ background: "#2B6CB0", color: "#fff", border: "none", borderRadius: 8, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Berikutnya →</button>
            </div>
          </div>
        )}

        {/* ── SUMMARY TAB ── */}
        {tab === "summary" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A202C" }}>Milestones Master Grid</h2>
                <span style={{ fontSize: 12, fontWeight: 700, color: roundColor }}>Tes ke-{testRound}</span>
              </div>

              {/* Legend */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", margin: "8px 0 16px", fontSize: 11, color: "#4A5568" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 16, height: 16, background: roundColor, border: "1px solid #E2E8F0", display: "inline-block" }} /> 1 (tercapai)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 16, height: 16, background: roundHalf, border: "1px solid #E2E8F0", display: "inline-block" }} /> ½ (parsial)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 16, height: 16, background: "#fff", border: "1px solid #E2E8F0", display: "inline-block" }} /> 0 / belum
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 16, height: 16, background: "#E2E8F0", border: "1px solid #E2E8F0", display: "inline-block" }} /> tidak dinilai di level ini
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 16, height: 16, background: "repeating-linear-gradient(45deg,#F7FAFC,#F7FAFC 3px,#EDF2F7 3px,#EDF2F7 6px)", border: "1px dashed #CBD5E0", display: "inline-block" }} /> dikecualikan / ditandai tidak dapat diuji
                </span>
              </div>

              <MilestoneGrid scores={scores} roundFull={roundColor} roundHalf={roundHalf} eesa={eesa} invalidItems={invalidItems} />

              {/* Per-level totals */}
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                {LEVELS.map(lv => (
                  <div key={lv.id} onClick={() => { setTab(lv.id); setDomainIdx(0); }}
                    style={{ cursor: "pointer", flex: "1 1 140px", background: BAND_TINT[lv.id], borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#2D3748" }}>{lv.label}</div>
                    <div style={{ fontSize: 11, color: "#718096" }}>{lv.range}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#2B6CB0", marginTop: 4 }}>{levelTotal(scores, lv, eesa, invalidItems)} / {levelMax(lv, invalidItems)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "#2B6CB0", borderRadius: 12, padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Total Milestones</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{grandTotal} / {GRAND_MAX}</span>
            </div>
            <p style={{ fontSize: 11, color: "#A0AEC0", textAlign: "center", margin: "-10px 0 0" }}>
              Skor maksimum: {GRAND_MAX_FULL} dikurangi {GRAND_MAX_FULL - GRAND_MAX} milestone dari domain yang dikecualikan secara permanen atau ditandai tidak dapat diuji = {GRAND_MAX}.
            </p>

            <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A202C", marginBottom: 12 }}>Kesimpulan & Rekomendasi Klinis</h2>
              <textarea value={kesimpulan} onChange={e => setKesimpulan(e.target.value)} rows={5}
                placeholder="Tulis kesimpulan klinis dan rekomendasi intervensi..."
                style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, color: "#2D3748", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }} />
            </div>

            {submitError && (
              <div style={{ background: "#FFF5F5", border: "1.5px solid #FC8181", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#C53030" }}>⚠️ {submitError}</div>
            )}
            {xlsxError && (
              <div style={{ background: "#FFF5F5", border: "1.5px solid #FC8181", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#C53030" }}>⚠️ {xlsxError}</div>
            )}
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={generateReport}
                style={{ flex: 1, background: "#EDF2F7", color: "#2D3748", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>📄 Laporan (.txt)</button>
              <button onClick={downloadExcel} disabled={xlsxBusy}
                style={{ flex: 1, background: xlsxBusy ? "#A0AEC0" : "#2B6CB0", color: "#fff", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: xlsxBusy ? "not-allowed" : "pointer" }}>
                {xlsxBusy ? "Membuat..." : "📊 Excel (Grafik)"}
              </button>
              <button onClick={downloadWordReport} disabled={wordBusy}
                style={{ flex: 1, background: wordBusy ? "#A0AEC0" : "#1E75BC", color: "#fff", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: wordBusy ? "not-allowed" : "pointer" }}>
                {wordBusy ? "Membuat..." : "📝 Laporan (Word)"}
              </button>
            </div>
            <button onClick={handleSubmit} disabled={submitting}
              style={{ width: "100%", background: submitting ? "#A0AEC0" : "#276749", color: "#fff", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 15, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", boxShadow: "0 2px 12px rgba(39,103,73,0.2)" }}>
              {submitting ? "Menyimpan..." : "💾 Simpan ke Database + Download Laporan"}
            </button>
            <p style={{ fontSize: 12, color: "#A0AEC0", textAlign: "center", margin: 0 }}>
              "Excel (Template)" mengunduh file .xlsx dengan grid pyramid berwarna sesuai tampilan Rekap — tidak memerlukan koneksi database.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
