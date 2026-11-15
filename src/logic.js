/* The Outgoing Log — logic core: script, state machine, ending resolver.
 * Pure and DOM-free so the Node test suite can drive whole playthroughs.
 * UMD: module.exports in Node, window.OL in the browser.
 *
 * Player-facing text rules (studio public-voice checklist): no em-dashes,
 * contractions welcome, plain words, no AI tells. The test suite greps
 * every string below against the banned list.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.OL = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- documents on the desk ---------------- */

  var DOCUMENTS = {
    daylog: {
      title: 'The day log',
      keeper: 'Written by Anselm Rook, day keeper, in his own hand.',
      lines: [
        '18:40. Fog coming in off the water, thick. Took the lamp down to the gate.',
        'No fog bell rung before the crossing. Gate opened on my own judgment.',
        'The courier Pell asked to cross with the mail cart and took the risk on his own head. Gate opened for him, cart away over the causeway.',
        '20:15. The courier\'s mare came back alone, harness on, traces cut clean. No sign of the cart. No sign of the boy.',
        'Fog still down at shift\'s end. Night keeper to write the outgoing log for the auditors at dawn.'
      ]
    },
    weather: {
      title: 'The weather note',
      keeper: 'Pinned by the door, in the watch officer\'s hand, times by the gate clock.',
      lines: [
        'Fog sighted off the north water, 18:20.',
        'Fog on the causeway, 18:40. Causeway closed to carts from this hour by the standing rule.',
        'Wind none. Tide turning at 21:00, low water at 03:10.',
        'Fog expected to hold until near dawn.'
      ]
    },
    tally: {
      title: 'The tally sheet',
      keeper: 'The gate tally, kept by whoever works the gate. Every opening gets a mark.',
      lines: [
        'Tuesday, the night before last: carts over, 3. Log entries for Tuesday crossings: 2.',
        'One cart crossed Tuesday that the day log never names. Unexplained counts have a way of mattering at dawn.',
        'Today: gate opened 19:05, one cart, mail. Horse returned alone 20:15.',
        'No other openings today. The gate has not moved since.'
      ]
    },
    routecard: {
      title: 'Pell\'s route card',
      keeper: 'Left in the desk drawer from his last dry run, in Pell\'s own hand.',
      lines: [
        'North road, out and back. Stones to the far rail: two hundred and six. I count them when the fog is in, so the horse does not have to think.',
        'If the fog comes down, wait it out. A late cart is a whole cart. A cart in the mud is neither.',
        'Mum\'s birthday is the 9th. Flowers from the far side if the bonus lands. Do not let her say she does not want any.'
      ]
    }
  };

  /* ---------------- the script ----------------
   * Node types: lines | desk | choice | gate | write | ending.
   * Choice options: kind 'ask' stays in the node and can be asked once;
   * kind 'go' leaves the node. 'requires' names a flag the player must
   * hold. 'sets' lists flags the option grants. 'lines' are spoken back
   * before the node re-offers or moves on. */

  var NODES = {

    title: {
      type: 'lines', next: 'desk',
      lines: [
        { who: 'narr', text: 'Kestrel Gate, on the north road out of the Reach. One gate, one causeway, one rule: no crossing after the fog bell, until the fog lifts.' },
        { who: 'narr', text: 'This afternoon the fog came in early. The day keeper opened the gate anyway and let a courier cross with the mail cart. The horse came back alone.' },
        { who: 'narr', text: 'The auditors come at dawn. They want the outgoing log, written by the night keeper. That is you. What you write decides who carries the blame.' },
        { who: 'narr', text: 'One night. About twenty minutes. Everything you need is on the desk or at the gate.' }
      ]
    },

    desk: {
      type: 'desk', next: 'w1_intro',
      intro: [
        { who: 'narr', text: 'The gatehouse is warm and smells of lamp oil. A bucket by the door catches the roof leak, steady as a clock. The office has been promising a repair since spring.' },
        { who: 'narr', text: 'On the desk: the day log, a weather note, and the tally sheet. In the drawer, the route card Pell left from his last dry run. You have taken this desk from Anselm Rook for six years. His hand is in every book in the room.' },
        { who: 'narr', text: 'Read before you do anything else. Read the day log first. The other two will still be here all night, and you can come back to any of them whenever you like. And hear people out tonight: at dawn you can only write an account you actually hold.' }
      ]
    },

    w1_intro: {
      type: 'lines', next: 'w1_maren',
      lines: [
        { who: 'narr', text: '22:00. The first watch. Fog presses at the window like something patient.' },
        { who: 'narr', text: 'A knock at the gate. Not the big knock of a carter. Smaller, and fast, and it does not stop until you open the door.' }
      ]
    },

    w1_maren: {
      type: 'choice', next: 'w1_gate',
      intro: [
        { who: 'narr', text: 'A young woman stands in the fog with a lantern and no coat. Maren, the courier\'s sister. Half the Reach knows her by sight.' },
        { who: 'maren', text: 'You\'re the night keeper. They said you\'d know. My brother went over this afternoon and his horse came back without him.' },
        { who: 'narr', text: 'A keeper learns what the log leaves out by asking. Ask her what you need to know.' },
        { who: 'maren', text: 'And when we\'ve talked, I\'m asking you to let me over. I know the causeway stones by count and I have a lantern.' }
      ],
      options: [
        {
          id: 'maren_pell', kind: 'ask', label: 'Ask about Pell',
          sets: ['heard_maren'],
          lines: [
            { who: 'maren', text: 'Pell is nineteen. He has run the mail since he was fifteen and he is careful, whatever the day log says. He is afraid of that causeway in fog. All the couriers are. You can hear the water under it and you cannot see your own horse\'s head.' },
            { who: 'maren', text: 'He would not ask to cross in fog. I\'m telling you that first because the log will tell you different, and the log is wrong. He owed Vane money, keeper. That hangs over all of it.' }
          ]
        },
        {
          id: 'maren_debt', kind: 'ask', label: 'Ask about the debt',
          requires: 'heard_maren', sets: ['heard_debt'],
          lines: [
            { who: 'maren', text: 'He owes Vane money. Cards, if you can believe it, a boy who never had two coins to knock together. Vane has been patient about it in the way that costs more later.' },
            { who: 'maren', text: 'Today\'s run carried a bonus. Far-side delivery before dark pays double. It would have cleared him. I told him the fog would take the bonus and maybe him with it. He said Vane\'s patience was worse than fog.' }
          ]
        },
        {
          id: 'maren_horse', kind: 'ask', label: 'Ask about the horse',
          sets: ['heard_horse'],
          lines: [
            { who: 'maren', text: 'The mare came back with her harness on and the traces cut clean. A horse does not cut its own traces, keeper.' },
            { who: 'maren', text: 'Either the cart went over and Pell cut her free so she would not go with it, or somebody else held a knife out there. I know which one I can live with. I am going to find out which one is true.' }
          ]
        },
        { id: 'maren_done', kind: 'go', label: 'Take her to the gate', lines: [] }
      ]
    },

    w1_gate: {
      type: 'gate', gate: 'maren', next: 'w2_intro',
      intro: [
        { who: 'maren', text: 'Let me over. I know the causeway stones by count and I have a lantern. If he is out there in the mud he is waiting for somebody, and it should be me.' },
        { who: 'narr', text: 'The rule says no crossing while the fog is down. The rule is why you have a gate. But a gate keeper decides, and a decision cuts both ways: open it, and the fog gets a second chance at her. Bar it, and whatever is out there waits alone till dawn.' }
      ],
      options: [
        {
          id: 'maren_open', label: 'Open the gate for her',
          lines: [
            { who: 'narr', text: 'You lift the bar and swing the gate wide. She is gone into the fog before the gate has stopped moving, lantern first, counting the stones out loud like a prayer.' },
            { who: 'narr', text: 'You write nothing down. Some things the night keeps to itself. You hope the fog is finished taking things.' }
          ]
        },
        {
          id: 'maren_bar', label: 'Bar the gate and keep her in',
          lines: [
            { who: 'maren', text: 'You would keep me here while he is out there? In the warm, with the lamp?' },
            { who: 'narr', text: 'You put her in the porch with a blanket and tea she does not drink. She sits facing the door all the same. The fog keeps its side of the bargain. So do you. It does not feel like keeping anyone safe.' }
          ]
        }
      ]
    },

    w2_intro: {
      type: 'lines', next: 'w2_sella',
      lines: [
        { who: 'narr', text: '23:30. The second watch. The fog bell hangs in its tower up the hill, and the woman who rings it comes down the path with her own lantern, unhurried, the way people walk when they know every stone.' }
      ]
    },

    w2_sella: {
      type: 'choice', next: 'w3_intro',
      intro: [
        { who: 'sella', text: 'Keeper. I am Sella Wray. I ring the fog bell, and I keep the bell book, and I have come down before the auditors come up, because I have read what Rook wrote about my bell.' },
        { who: 'sella', text: 'Ask me straight and I will answer straight. It is more than the log did.' }
      ],
      options: [
        {
          id: 'sella_bell', kind: 'ask', label: 'Ask about the ringing',
          sets: ['heard_sella'],
          lines: [
            { who: 'sella', text: 'I rang at a quarter to seven, when the fog came onto the causeway. I rang again at seven, because I saw Rook\'s lamp go down to the gate and I wanted his ears full of it while he decided.' },
            { who: 'sella', text: 'Both rings are in the bell book with the times, in ink, written as I did them. Rook wrote that no bell was rung. One of us is lying in a book, keeper, and it is not the one who came down the hill to say so.' }
          ]
        },
        {
          id: 'sella_rook', kind: 'ask', label: 'Ask about Rook',
          sets: ['sella_rook'],
          lines: [
            { who: 'sella', text: 'Anselm Rook is not a bad man, which is the trouble with him. Last spring he asked me to leave a late crossing out of the bell book, a friend of his, a cart that came over after the ring. I told him the book is the book.' },
            { who: 'sella', text: 'He did not hold it against me. He just stopped asking me, and started writing around me instead. Today he wrote around my bell altogether.' }
          ]
        },
        {
          id: 'sella_causeway', kind: 'ask', label: 'Ask what the fog does out there',
          sets: ['sella_causeway'],
          lines: [
            { who: 'sella', text: 'The causeway floods at the far end first, by the broken rail. A cart that leaves the stones there goes into the mud and the tide does the rest. If the boy got that far, the cart is in the mud and he cut the horse free to save her.' },
            { who: 'sella', text: 'If he did not get that far, then he turned back into the fog and the fog kept him. I have rung for this road forty years. Nobody the fog takes comes back in the shape they left in.' }
          ]
        },
        {
          id: 'sella_done', kind: 'go', label: 'Walk her back to the door',
          lines: [
            { who: 'sella', text: 'Write what you heard, keeper. That is all a log is. It is only hard when you heard two things.' }
          ]
        }
      ]
    },

    w3_intro: {
      type: 'lines', next: 'w3_vane',
      lines: [
        { who: 'narr', text: '01:00. The third watch. A cart lamp out in the fog, swaying, and a man\'s voice calling the gate by name, friendly as you like.' }
      ]
    },

    w3_vane: {
      type: 'choice', next: 'w3_gate',
      intro: [
        { who: 'vane', text: 'Keeper. Vane, with a cart for the far side, wool and lamp oil, all lawful. I heard about the boy. Terrible. Terrible. Now, my cart pays by the far side, same as his did, so let us not waste the night.' },
        { who: 'narr', text: 'He smiles like a man doing you a favor by arriving. Ask him what you need. Watch what he does with his hands when you do.' }
      ],
      options: [
        {
          id: 'vane_debt', kind: 'ask', label: 'Ask about Pell\'s debt',
          sets: ['heard_vane'],
          lines: [
            { who: 'vane', text: 'The boy owed me, yes. I carried him longer than most would. Cards. Half the couriers on this road owe me for cards, and the boy owed longest.' },
            { who: 'vane', text: 'But hear me, keeper. Today\'s bonus would have cleared him whole. He knew it. He begged Rook for that gate, begged like a man who could see the far side of his troubles. Whatever Rook wrote about the asking, that much is gospel.' }
          ]
        },
        {
          id: 'vane_pell', kind: 'ask', label: 'Ask when he last saw Pell',
          sets: ['vane_pell'],
          lines: [
            { who: 'vane', text: 'At the gate, this afternoon, same as everyone. He had the mail cart loaded and the bonus on his mind. I told him, I said, boy, the fog pays nobody. He laughed at me.' },
            { who: 'vane', text: 'He is not laughing now, wherever he is. Ask Rook about the rest of it. Rook is the one who opened the gate. I only ever held the paper on a card debt.' }
          ]
        },
        {
          id: 'vane_tally', kind: 'ask', label: 'Ask about the unlogged cart on Tuesday',
          requires: 'read_tally', sets: ['vane_confronted'],
          lines: [
            { who: 'narr', text: 'His hands stop moving. That is the whole answer, and he knows you saw it.' },
            { who: 'vane', text: 'The tally sheet. Yes. Rook keeps a tidy sheet, I will give him that. One cart, keeper, one time, and money paid to keep it out of the log. These things are done between keepers and carters since before you had the coat.' },
            { who: 'vane', text: 'I am not confessing to your book. I am telling you the road runs on favors, and a log that says so will make enemies of everyone who keeps it running. Write what you like. Write it knowing that.' }
          ]
        },
        {
          id: 'vane_done', kind: 'go', label: 'Take him to the gate',
          lines: [
            { who: 'vane', text: 'Well? The fog is not getting younger, and neither is my wool.' }
          ]
        }
      ]
    },

    w3_gate: {
      type: 'gate', gate: 'vane', next: 'w4_intro',
      intro: [
        { who: 'narr', text: 'His cart stands loaded in the fog, horse stamping. The rule is the same rule it was at the first watch. The man is not the same man.' },
        { who: 'narr', text: 'If he goes, the one man who can speak to Tuesday goes with him, and the auditors will find an empty yard. If he stays, he stays in your yard, angry, where the auditors can see him.' }
      ],
      options: [
        {
          id: 'vane_open', label: 'Open the gate for the cart',
          lines: [
            { who: 'narr', text: 'You swing the gate and he is through and gone, lamp swaying down the stones, whistling. The fog takes the sound first, then the light.' },
            { who: 'narr', text: 'Whatever he knows about Tuesday night is on the far side of the water now, and the auditors will find an empty yard and a keeper who let him go.' }
          ]
        },
        {
          id: 'vane_bar', label: 'Bar the gate and keep the cart in the yard',
          lines: [
            { who: 'vane', text: 'You are making an enemy over a rule, keeper.' },
            { who: 'narr', text: 'You bar the gate and tell him the yard is dry and the stable is open. He unhitches with great care and does not speak again. He will be here at dawn, in the yard, where the auditors can see him. So will his cart.' }
          ]
        }
      ]
    },

    w4_intro: {
      type: 'lines', next: 'w4_rook',
      lines: [
        { who: 'narr', text: '02:30. The fourth watch. A figure comes down the hill path from the keepers\' cottages, no lantern, walking the dark he knows by heart.' },
        { who: 'narr', text: 'Anselm Rook. The day keeper. The man whose hand wrote the log on your desk.' }
      ]
    },

    w4_rook: {
      type: 'choice', next: 'w5_intro',
      intro: [
        { who: 'rook', text: 'Could not sleep. Kept seeing the horse come up the road. You have read my log, then. It is all in the log, keeper. I wrote it plain.' },
        { who: 'narr', text: 'You have heard a night full of people. Lay what you have in front of him, one thing at a time, and watch the story move. What you can put to him depends on what you heard tonight. There is more in him than the first answer. Keep going.' }
      ],
      options: [
        {
          id: 'rook_boy', kind: 'ask', label: 'Ask about Pell',
          sets: ['rook_boy'],
          lines: [
            { who: 'rook', text: 'I have known that boy since he was small enough to ride the mail bags. His mother brought soup to this gatehouse when my wife died. You think I opened that gate lightly?' },
            { who: 'rook', text: 'Whatever you write tomorrow, write that I knew him. The auditors will think I opened it for a stranger\'s coin. I opened it for Pell. That is the whole shame of it.' }
          ]
        },
        {
          id: 'rook_years', kind: 'ask', label: 'Ask how long he has kept this gate',
          sets: ['rook_years'],
          lines: [
            { who: 'rook', text: 'Eleven years at this desk. You have had the nights for six of them, and never once asked me a question you did not need. So ask this one plainly too.' },
            { who: 'rook', text: 'I was proud of this gate. That is the rotten part. A proud man writes a log that protects the gate, and tells himself he is protecting the road.' }
          ]
        },
        {
          id: 'rook_bell', kind: 'ask', label: 'Put Sella\'s account to him',
          requires: 'heard_sella', sets: ['rook_admits_bell'],
          lines: [
            { who: 'narr', text: 'You tell him: the bell book says two rings, a quarter to seven and seven, in ink, written as she rang them. He looks at the desk for a long time.' },
            { who: 'rook', text: 'The first one, I will swear I never heard. The wind, the lamp, I do not know. The second one...' },
            { who: 'narr', text: 'The weather note on your desk says the wind was none, all evening. You let the excuse sit where he put it.' },
            { who: 'rook', text: 'I heard the second one. God help me. I was standing at the gate with my hand on the bar and I heard it, and the boy was looking at me, and I lifted the bar anyway. Write that I am a liar in my own log before you write that I am deaf. At least the lying was mine.' },
            { who: 'rook', text: 'Last spring I asked Sella to leave a crossing out of her book, and she refused me to my face. I should have learned the road from her.' }
          ]
        },
        {
          id: 'rook_asking', kind: 'ask', label: 'Put the asking to him',
          requiresAny: ['rook_admits_bell', 'heard_maren', 'heard_vane'], sets: ['rook_admits_asking'],
          lines: [
            { who: 'narr', text: 'You put it to him. The log says Pell took the risk on his own head. His sister says he was afraid of the causeway. Vane says he begged. Which is it, Anselm?' },
            { who: 'rook', text: 'He begged. That is the worst of it and I have been carrying it since the horse came back. He begged me, keeper to courier, boy I have known since he was small, and I said yes, and then I wrote that he took the risk on himself, as if a begged-for yes is the same as a choice.' },
            { who: 'rook', text: 'It is not the same. I knew it when I wrote it. A man who begs is asking you to carry it with him. I carried it as far as the gate and then I put it all on him, in ink.' }
          ]
        },
        {
          id: 'rook_cart', kind: 'ask', label: 'Put the tally sheet to him',
          requires: 'read_tally', requiresAny: ['rook_admits_asking', 'vane_confronted', 'heard_sella'], sets: ['rook_admits_cart'],
          lines: [
            { who: 'narr', text: 'You lay the tally sheet on the desk. Three carts Tuesday. Two entries in the log. You do not say a word.' },
            { who: 'rook', text: 'Vane paid me. Not for Pell, never for Pell, I would cut my hand off first. Tuesday night, his cart, no entry, money in my coat. The gatehouse roof leaked all winter and the office would not pay, and I told myself the money was for the roof. It was for the quiet. It was always for the quiet.' },
            { who: 'rook', text: 'When the auditors read that sheet they will hang Tuesday and today on the same nail, and they will not be wrong to. Write it how it was. I am done writing around things.' }
          ]
        },
        {
          id: 'rook_done', kind: 'go', label: 'Send him back up the hill',
          lines: [
            { who: 'rook', text: 'Whatever you write, write it as if he could read it. That is where I went wrong. I wrote mine as if only the auditors would.' }
          ]
        }
      ]
    },

    w5_intro: {
      type: 'lines', next: 'w5_runner',
      lines: [
        { who: 'narr', text: '04:00. The last watch. Boots on the headland path, young and quick, and a clerk\'s satchel banging at a hip. The auditors send their runner ahead of them, the way weather sends a first cold gust.' },
        { who: 'narr', text: 'The runners come down the headland path, above the fog. The causeway rule was never theirs to break.' }
      ]
    },

    w5_runner: {
      type: 'choice', next: 'dawn_intro',
      intro: [
        { who: 'wick', text: 'I\'m Wick, clerk to the auditors. I ride ahead with the questions so the log can answer them standing up, as my masters say. Three questions, keeper, the same three the whole Reach is asking.' },
        { who: 'wick', text: 'You can answer me now, or the log can answer at dawn. The log is the one they keep. And a word between us: my masters read tally sheets too. They always read the tally sheet.' },
        { who: 'narr', text: 'Whatever you write is what the record says. That is the whole of your job tonight, and it is nearly dawn.' }
      ],
      options: [
        {
          id: 'wick_bell', kind: 'ask', label: 'Hear the first question: the bell',
          sets: ['wick_bell'],
          lines: [
            { who: 'wick', text: 'First. Was the fog bell rung before the crossing, or was it not? The day log says not. The bell keeper has a book that says twice. The auditors will ask which book the outgoing log stands behind.' }
          ]
        },
        {
          id: 'wick_asking', kind: 'ask', label: 'Hear the second question: the asking',
          sets: ['wick_asking'],
          lines: [
            { who: 'wick', text: 'Second. Did the courier ask to cross, or did he cross without asking? His sister says he\'d never ask in fog. The day log says he asked and took the risk on himself. A boy who asks is one kind of dead, if he is dead. A boy let through unasked is another. The auditors are particular about the difference, and so is his sister.' }
          ]
        },
        {
          id: 'wick_cart', kind: 'ask', label: 'Hear the third question: the tally',
          sets: ['wick_cart'],
          lines: [
            { who: 'wick', text: 'Third. The tally counts a crossing the log does not name, the night before last. The auditors will want the outgoing log to name it, or to explain it, or to be caught leaving it out. Those are the three shapes it can take, keeper. I have seen all three.' }
          ]
        },
        {
          id: 'wick_done', kind: 'go', label: 'Give him tea and wait for the light',
          lines: [
            { who: 'wick', text: 'Then I will sit by your stove, keeper, and we will watch the fog decide what kind of morning it wants to be.' }
          ]
        }
      ]
    },

    dawn_intro: {
      type: 'lines', next: 'write',
      lines: [
        { who: 'narr', text: '05:30. The fog is thinning at the edges. Somewhere up the hill a door closes: the auditors, on their way down.' },
        { who: 'narr', text: 'The outgoing log lies open on the desk. Three entries are yours to write: the bell, the asking, and the cart the log never named. You can only write an account you actually hold, from the desk or from the night. Choose what the record says.' },
        { who: 'narr', text: 'These are the same three questions Wick carried down the hill, and the auditors read them in this order: the bell first, then the asking, then the cart. Each wording below is an account, and the log prints the one you pick, as written.' }
      ]
    },

    write: { type: 'write', next: 'ending' },
    ending: { type: 'ending' }
  };

  var ORDER = ['title', 'desk', 'w1_intro', 'w1_maren', 'w1_gate',
    'w2_intro', 'w2_sella', 'w3_intro', 'w3_vane', 'w3_gate', 'w4_intro',
    'w4_rook', 'w5_intro', 'w5_runner', 'dawn_intro', 'write', 'ending'];

  /* ---------------- the dawn writing ---------------- */

  var WRITE_POINTS = [
    {
      id: 'bell', title: 'First entry: the bell',
      prompt: 'What does the outgoing log say about the fog bell?',
      options: [
        { id: 'bell_rung_sella', stance: 'rung', requires: 'heard_sella', source: 'Sella\'s account, and her bell book',
          label: 'The bell was rung, twice, in good time',
          logLine: 'The fog bell was rung twice before the crossing, at a quarter to seven and at seven, and the times stand in the bell book.' },
        { id: 'bell_rung_admission', stance: 'rung', requires: 'rook_admits_bell', source: 'Rook\'s own admission, given in the night',
          label: 'The bell was rung, and the day keeper heard it',
          logLine: 'The fog bell was rung twice. The day keeper heard the second ring with his hand on the bar, and opened the gate anyway.' },
        { id: 'bell_notrung', stance: 'not-rung', source: 'The day log, as Rook wrote it',
          label: 'No fog bell was rung before the crossing',
          logLine: 'No fog bell was rung before the crossing. The gate was opened on the day keeper\'s own judgment.' },
        { id: 'bell_open', stance: 'open', source: 'Your own hand',
          label: 'The record does not settle whether the bell was rung',
          logLine: 'The record does not settle whether the fog bell was rung. The bell book and the day log disagree, and this log will not choose between them.' }
      ]
    },
    {
      id: 'asking', title: 'Second entry: the asking',
      prompt: 'What does the outgoing log say about how Pell came to cross?',
      options: [
        { id: 'ask_begged', stance: 'asked', requires: 'rook_admits_asking', source: 'Rook\'s own admission, given in the night',
          label: 'He begged to cross, and the keeper said yes',
          logLine: 'The courier begged to cross, and the day keeper said yes, knowing the boy was afraid of the causeway. A begged-for yes is not the same as a choice, and this log will not call it one.' },
        { id: 'ask_asked_log', stance: 'asked', source: 'The day log, as Rook wrote it',
          label: 'He asked to cross and took the risk on himself',
          logLine: 'The courier asked to cross with the mail cart and took the risk on his own head.' },
        { id: 'ask_asked_vane', stance: 'asked', requires: 'heard_vane', source: 'Vane\'s account, at the gate',
          label: 'He begged to cross, for the bonus',
          logLine: 'The courier begged to cross. The run carried a bonus that would have cleared his debt to the carter Vane, and he wanted it badly enough to ask in fog.' },
        { id: 'ask_notasked', stance: 'not-asked', requires: 'heard_maren', source: 'Maren\'s account, at the gate',
          label: 'He did not ask. He was afraid of the causeway',
          logLine: 'The courier did not ask to cross. He was afraid of the causeway in fog, as all the couriers are, and this log finds that he did not ask.' },
        { id: 'ask_open', stance: 'open', source: 'Your own hand',
          label: 'The record does not settle the asking',
          logLine: 'The record does not settle whether the courier asked to cross. The accounts disagree, and this log will not choose between them.' }
      ]
    },
    {
      id: 'cart', title: 'Third entry: the unlogged cart',
      prompt: 'The tally counts a crossing the day log never named. What does the outgoing log say?',
      options: [
        { id: 'cart_favor_tally', stance: 'favor', requires: 'read_tally', source: 'The tally sheet, on your desk',
          label: 'A cart crossed unlogged on Tuesday night',
          logLine: 'On Tuesday night a cart crossed with no entry in the log. The tally counts three carts over, and the log names two. This log names the gap, and leaves the reason for it to the auditors.' },
        { id: 'cart_favor_admission', stance: 'favor', requires: 'rook_admits_cart', source: 'Rook\'s own admission, given in the night',
          label: 'The day keeper took money for an unlogged crossing',
          logLine: 'On Tuesday night the day keeper took money from the carter Vane for a crossing he did not log. He admitted it in this gatehouse, in the night, to the keeper writing this.' },
        { id: 'cart_mistake', stance: 'mistake', source: 'A kind reading of the sheet',
          label: 'The tally count is a keeper\'s error',
          logLine: 'The tally count for Tuesday is a keeper\'s error in the marking. No cart crossed unlogged.' },
        { id: 'cart_omit', stance: 'omitted', source: 'Your own hand',
          label: 'Leave it out of the log',
          logLine: null },
        { id: 'cart_open', stance: 'open', requires: 'read_tally', source: 'Your own hand',
          label: 'The record does not settle the unlogged crossing',
          logLine: 'The tally counts a crossing the log does not name, and this log cannot settle it.' }
      ]
    }
  ];

  /* ---------------- endings ---------------- */

  var ENDINGS = {
    'gate-closed': {
      title: 'THE GATE CLOSES',
      body: [
        'The auditors read the outgoing log at your desk, and then they read the tally sheet, the way Wick said they would. It took them less than a minute to find Tuesday.',
        'A log that backs the day keeper on the bell and says nothing about the cart is not a mistake. They have a word for it, and the word ends the gate. The bar comes off its hinges that same week. The causeway keeps its fog and loses its keeper, and carts go the long way round the headland until someone in an office decides the Reach can be trusted again.',
        'Rook is struck off beside you. Whatever you meant to protect, the sheet protected nobody. It only chose the ground you both fell on.',
        'Of Pell there is still no word. The inquiry will ask about him in rooms you will never see, and answer itself the same way.'
      ]
    },
    'rook-carries-it': {
      title: 'ROOK CARRIES IT',
      body: [
        'The auditors read the log twice. The second time, one of them walks up the hill to the bell tower and comes back with Sella\'s book under his arm, and the two books agree with yours and not with Rook\'s.',
        'Rook is struck from the gate service before noon. He hands in the day coat at your desk and does not argue. At the door he says the log was the first true thing written about him in years, and that he wrote half of it himself, in the night, out loud. Then he walks up the hill to tell Pell\'s mother before the office can.',
        'You keep the gate. The bell rings out over the causeway that evening, on time, and the sound carries a long way in the clear air.',
        'Of Pell there is still no word. Rook walks up the hill to tell his mother himself, before the office can. Whatever the fog has, it keeps it a while longer.'
      ]
    },
    'favor-named': {
      title: 'THE FAVOR IS NAMED',
      body: [
        'The auditors read the outgoing log, and then they read the tally sheet, and for once the two books tell the same story about Tuesday: a cart crossed, no entry was made, and the night keeper has written the gap down in ink where it cannot be smoothed away.',
        'That is enough to end Rook\'s time on the day gate. Not struck off in disgrace, not yet. Suspended, and sent up the hill to wait while the office decides what a paid silence is worth. He hands in the day coat without arguing. A man who has been paid for quiet knows what it sounds like when the quiet runs out.',
        'Whatever else the log left open, the bell, the asking, stays open with it. But the cart is named now, and a named thing can be carried by the man who did it, instead of by whoever the office finds convenient.',
        'At the change of shift he stops at your desk. "You wrote it the way it was," he says. "That is a new experience for this gatehouse." Then he goes up the hill, the day coat folded over his arm like something that belongs to somebody else now.',
        'Of Pell there is still no word. Under the questions about carts and bells, his name stays at the top of the file, unanswered.'
      ]
    },
    'pell-named': {
      title: 'THE BOY CARRIES IT',
      body: [
        'The auditors are pleased with the log. It is tidy. The bell was not rung, the boy asked, the boy took the risk on his own head. A closed account, signed by the night.',
        'Rook keeps the day gate. Sella keeps her bell, though the log has marked her book as the one that was wrong, and she knows it, and she will ring over this road for years with that written under her name. And Pell, wherever the fog has him, carries the whole of it, because a missing boy cannot hand any of it back.',
        'You keep the gate too. Some nights the fog comes in and you hear a horse on the stones that is not there, and you get up and check the bar, and the bar is fine, and that is the size of the rest of your life at this gate.',
        'Nobody goes looking for Pell again until the tide turns. That is the size of what the log decided.'
      ]
    },
    'sella-named': {
      title: 'SELLA CARRIES IT',
      body: [
        'The log says no bell was rung, and the auditors believe the log, because the log is what they came for. The bell book is taken as something the bell keeper made up. Sella Wray is struck from the bell post she has held for forty years.',
        'She comes down the hill one last time to give you the tower key. She does not rail. She says a bell is only a rope and a weight of iron, and a book only counts if the next book believes it. Then she goes up to her cottage, and the hill is quieter than it has any right to be.',
        'Rook keeps the day gate. Neither of you meets the other\'s eye at the change of shift, ever again. The fog bell rings the next night, rung by a boy from the village who is still learning where the rope is.',
        'Of Pell there is still no word. The new bell boy rings at the wrong hour on his first night, and the sound goes over the water like a question nobody answers.'
      ]
    },
    'record-stays-open': {
      title: 'THE RECORD STAYS OPEN',
      body: [
        'The auditors read the log and find a careful document that settles less than they hoped. They are not angry. They are worse than angry: they take the day log, the tally sheet, the bell book, and your outgoing log away in a satchel, and the inquiry goes to the office, where it will be settled by people who were not in the fog.',
        'Rook keeps the gate for now, under warning, and only just. Sella keeps her bell. Nobody is struck off and nobody is cleared, and Pell\'s name stays in the open file, which is the office\'s way of saying a thing is not finished with anyone yet.',
        'You keep the night. It is not the worst ending a log can have. It is only the one where the writing stops being yours.',
        'Wick stays until the stove goes cold. "For what it is worth," he says at the door, "I have carried worse logs than yours up that hill. I have carried better ones too." Then the fog takes him, the way it takes everything here, without comment.',
        'Pell\'s name stays in the open file. An open file is not an answer. It is a promise that somebody, someday, has to go on asking.'
      ]
    }
  };

  function resolveEnding(state) {
    var bell = state.log.bell && state.log.bell.stance;
    var asking = state.log.asking && state.log.asking.stance;
    var cart = state.log.cart && state.log.cart.stance;
    var slug;
    if (bell === 'not-rung' && cart === 'omitted') slug = 'gate-closed';
    else if (bell === 'rung' && cart === 'favor') slug = 'rook-carries-it';
    else if (cart === 'favor') slug = 'favor-named';
    else if (bell === 'not-rung' && asking === 'asked') slug = 'pell-named';
    else if (bell === 'not-rung') slug = 'sella-named';
    else slug = 'record-stays-open';

    var body = ENDINGS[slug].body.slice();

    // Evidence strength counts: an admission in the log is heavier
    // than a sheet, and the resolver says so.
    if (cart === 'favor' && (slug === 'rook-carries-it' || slug === 'favor-named')) {
      if (state.log.cart.id === 'cart_favor_admission') {
        body.push('It is Rook\'s own admission that does it, in the end. Paper can be argued with. A man\'s own words, written down the same night he said them, cannot.');
      } else if (state.log.cart.id === 'cart_favor_tally') {
        body.push('It is the sheet that does it, in the end. Three marks against two entries, in the day keeper\'s own hand. Paper can be argued with, but arithmetic is harder to argue with.');
      }
    }
    // The asking entry is read on its own weight in the open endings.
    if (slug === 'favor-named' || slug === 'record-stays-open') {
      if (state.log.asking && state.log.asking.id === 'ask_begged') {
        body.push('The asking entry is the one the auditors read twice. A begged-for yes, set down in ink, is hard to read as anything but what it was.');
      } else if (asking === 'not-asked') {
        body.push('The asking entry stands on Maren\'s word alone, and the office will weigh it the way offices weigh a sister\'s word. It is in the book anyway. That is what books are for.');
      }
    }

    var epilogues = [];
    if (state.gate.maren === 'opened') {
      epilogues.push('Maren came back over the causeway as the light came up, lantern dead, coat stiff with mud to the knee. She found the cart at the far end, broken against the rail, and Pell\'s scarf caught on the rail above the tide line. No more than that. She stood in your doorway and told you the way a person reports weather, and then she sat down by the stove and did not cry until the auditors had gone.');
    } else {
      epilogues.push('Maren waited in the porch all night, facing the door. At dawn she walked the headland road the long way round to look for her brother, because the gate would not open for her and the office had no news it could give her. She did not thank you for keeping her safe. She may never know what to thank you for, or blame you for, and neither do you.');
    }
    if (state.gate.vane === 'opened') {
      var vaneGone = 'Vane is gone. His cart crossed in the third watch and the far side has him now, and whatever the auditors want to ask him about Tuesday will have to wait for a man who is in no hurry to be asked.';
      if (cart === 'favor') vaneGone += ' Your log names his favor, so the asking will happen on paper if it never happens in a room.';
      else if (cart === 'omitted') vaneGone += ' Your log says nothing about Tuesday, so on paper there is nothing to ask him at all.';
      else vaneGone += ' Your log leaves Tuesday unsettled, and an unsettled line follows a man home eventually.';
      epilogues.push(vaneGone);
    } else {
      epilogues.push('Vane is in your yard when the auditors come down, unhitching nothing, standing by his cart with his hat in his hands. They take him into the gatehouse to talk about the tally sheet, and he goes the way a man goes when the paper has already said it all.');
    }

    var logLines = [];
    WRITE_POINTS.forEach(function (p) {
      var choice = state.log[p.id];
      if (choice && choice.logLine) logLines.push(choice.logLine);
    });

    return {
      slug: slug,
      title: ENDINGS[slug].title,
      body: body,
      epilogues: epilogues,
      logLines: logLines
    };
  }

  /* ---------------- engine ---------------- */

  function newGame() {
    return {
      node: 'title',
      flags: {},
      asked: {},          // nodeId -> { optionId: true }
      gate: {},           // 'maren' | 'vane' -> 'opened' | 'barred'
      log: {},            // pointId -> chosen write option (with stance/logLine)
      writeStep: 0,
      watchesDone: []     // watch numbers completed, for telemetry hooks
    };
  }

  function has(state, flag) { return !!state.flags[flag]; }

  function nodeDef(state) { return NODES[state.node]; }

  /* Options currently offered at a choice / gate / desk / write node. */
  function visibleOptions(state) {
    var node = nodeDef(state);
    if (!node) return [];
    if (node.type === 'desk') {
      var out = [];
      Object.keys(DOCUMENTS).forEach(function (key) {
        out.push({ id: 'doc_' + key, kind: 'doc', label: 'Read ' + DOCUMENTS[key].title.toLowerCase(), doc: key });
      });
      if (has(state, 'read_daylog')) {
        out.push({ id: 'desk_done', kind: 'go', label: 'Blow out the desk lamp and start the first watch', lines: [] });
      }
      return out;
    }
    if (node.type === 'write') {
      var point = WRITE_POINTS[state.writeStep];
      if (!point) return [];
      return point.options.filter(function (o) {
        return !o.requires || has(state, o.requires);
      }).map(function (o) {
        return { id: o.id, kind: 'write', label: o.label, source: o.source, stance: o.stance, point: point.id };
      });
    }
    if (node.type === 'choice' || node.type === 'gate') {
      var askedHere = state.asked[state.node] || {};
      return node.options.filter(function (o) {
        if (o.kind === 'ask' && askedHere[o.id]) return false;
        if (o.requires && !has(state, o.requires)) return false;
        if (o.requiresAny && !o.requiresAny.some(function (f) { return has(state, f); })) return false;
        return true;
      });
    }
    return [];
  }

  /* Read a desk document at any time (the desk node, or the desk bar
   * during the night). Sets the read flag and returns display lines. */
  function readDocument(state, docKey) {
    var d = DOCUMENTS[docKey];
    if (!d) return null;
    state.flags['read_' + docKey] = true;
    var lines = [{ who: 'doc', text: d.title.toUpperCase() + '. ' + d.keeper }];
    d.lines.forEach(function (l) { lines.push({ who: 'doc', text: l }); });
    // The tally is a living sheet: it counts the player's own night too.
    if (docKey === 'tally') {
      var mine = [];
      if (state.gate.maren === 'opened') mine.push('the gate opened for Maren');
      if (state.gate.vane === 'opened') mine.push('the gate opened for Vane\'s cart');
      if (mine.length) {
        lines.push({ who: 'doc', text: 'Tonight, in your own hand: ' + mine.join('; ') + '. The marks are fresh, and they are yours.' });
      } else if (state.gate.maren || state.gate.vane) {
        lines.push({ who: 'doc', text: 'Tonight, in your own hand: the gate opened for no one. The rule held.' });
      }
      if (has(state, 'vane_confronted') && !state.flags.reread_tally) {
        state.flags.reread_tally = true;
        lines.push({ who: 'narr', text: 'Read again after Vane, the gap has a shape now: one cart, one favor, one name left out.' });
      }
    }
    if (docKey === 'daylog' && has(state, 'rook_admits_bell') && !state.flags.reread_daylog) {
      state.flags.reread_daylog = true;
      lines.push({ who: 'narr', text: 'Read again after Rook, the second line is the one he could not say out loud until the fourth watch: no bell rung. He heard it ring.' });
    }
    return lines;
  }

  /* Apply a choice. Returns { lines: [...] } to display, or null if the
   * option is not currently offered. Mutates state. */
  function choose(state, optionId) {
    var node = nodeDef(state);
    if (!node) return null;

    if (node.type === 'desk') {
      if (optionId === 'desk_done') {
        if (!has(state, 'read_daylog')) return null;
        state.node = node.next;
        return { lines: [] };
      }
      var docKey = optionId.replace(/^doc_/, '');
      var docLines = readDocument(state, docKey);
      if (!docLines) return null;
      return { lines: docLines };
    }

    if (node.type === 'write') {
      var point = WRITE_POINTS[state.writeStep];
      if (!point) return null;
      var opt = null;
      point.options.forEach(function (o) { if (o.id === optionId) opt = o; });
      if (!opt) return null;
      if (opt.requires && !has(state, opt.requires)) return null;
      state.log[point.id] = opt;
      state.writeStep += 1;
      if (state.writeStep >= WRITE_POINTS.length) {
        state.node = node.next;
        return { lines: [], wrote: point.id, endingReady: true };
      }
      return { lines: [], wrote: point.id };
    }

    var options = visibleOptions(state);
    var chosen = null;
    options.forEach(function (o) { if (o.id === optionId) chosen = o; });
    if (!chosen) return null;
    var def = null;
    (node.options || []).forEach(function (o) { if (o.id === optionId) def = o; });
    if (!def) return null;

    if (def.sets) def.sets.forEach(function (f) { state.flags[f] = true; });

    if (node.type === 'gate') {
      state.gate[node.gate] = (optionId.indexOf('_open') >= 0) ? 'opened' : 'barred';
      state.node = node.next;
      return { lines: def.lines || [], gateDecision: { gate: node.gate, choice: state.gate[node.gate] } };
    }

    if (def.kind === 'ask') {
      state.asked[state.node] = state.asked[state.node] || {};
      state.asked[state.node][def.id] = true;
      return { lines: def.lines || [] };
    }

    // kind 'go': leaving a watch node completes that watch.
    var m = /^w(\d)_/.exec(state.node);
    if (m) state.watchesDone.push(m[1]);
    state.node = node.next;
    return { lines: def.lines || [] };
  }

  /* Advance a 'lines' node. */
  function advance(state) {
    var node = nodeDef(state);
    if (!node || node.type !== 'lines') return false;
    state.node = node.next;
    return true;
  }

  /* Where each core verb is first taught (teaching audit + tests). */
  var TEACH = { read: 'desk', ask: 'w1_maren', decide: 'w1_gate', write: 'w5_runner' };

  return {
    DOCUMENTS: DOCUMENTS,
    NODES: NODES,
    ORDER: ORDER,
    WRITE_POINTS: WRITE_POINTS,
    ENDINGS: ENDINGS,
    TEACH: TEACH,
    newGame: newGame,
    has: has,
    nodeDef: nodeDef,
    visibleOptions: visibleOptions,
    choose: choose,
    advance: advance,
    readDocument: readDocument,
    resolveEnding: resolveEnding
  };
});
