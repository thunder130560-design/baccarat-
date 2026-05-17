// baccarat_engine.js - Core Casino Logic & Shoe Tracking Matrix
class BaccaratEngine {
    constructor() {
        this.walletBalance = 20000;
        this.maxBetLimit = 5000;
        this.gameHistoryLog = []; // Cumulative win record patterns
        this.roundCounter = 0;    // Tracks shoe size up to 60 rounds Max
        this.shoeCutState = false; // Ensures shoe cutting runs once at game startup
        this.activeWagers = { PLAYER: 0, BANKER: 0, TIE: 0, P_PAIR: 0, B_PAIR: 0, SUPER6: 0, PANDA8: 0 };
    }

    resetShoe() {
        this.gameHistoryLog = [];
        this.roundCounter = 0;
        this.shoeCutState = true;
    }

    fetchRandomCard() {
        const suits = ['♠','♥','♦','♣'];
        const faces = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
        let face = faces[Math.floor(Math.random() * faces.length)];
        let suit = suits[Math.floor(Math.random() * suits.length)];
        let scoreVal = (['J','Q','K','10'].includes(face)) ? 0 : (face === 'A' ? 1 : parseInt(face));
        return { text: face + suit, val: scoreVal, rawFace: face, css: ['♥','♦'].includes(suit) ? "card red" : "card" };
    }

    calculateRound(wagers) {
        this.roundCounter++;
        
        let pHand = [this.fetchRandomCard(), this.fetchRandomCard()];
        let bHand = [this.fetchRandomCard(), this.fetchRandomCard()];

        let pScore = (pHand[0].val + pHand[1].val) % 10;
        let bScore = (bHand[0].val + bHand[1].val) % 10;

        let hasPPair = (pHand[0].rawFace === pHand[1].rawFace);
        let hasBPair = (bHand[0].rawFace === bHand[1].rawFace);

        // Standard Baccarat Third Card Pipeline Rules
        if (pScore < 8 && bScore < 8) {
            if (pScore <= 5) {
                let pThird = this.fetchRandomCard();
                pHand.push(pThird);
                pScore = pHand.reduce((sum, c) => sum + c.val, 0) % 10;
                
                let p3v = pThird.val;
                if (bScore <= 2) bHand.push(this.fetchRandomCard());
                else if (bScore === 3 && p3v !== 8) bHand.push(this.fetchRandomCard());
                else if (bScore === 4 && [2, 3, 4, 5, 6, 7].includes(p3v)) bHand.push(this.fetchRandomCard());
                else if (bScore === 5 && [4, 5, 6, 7].includes(p3v)) bHand.push(this.fetchRandomCard());
                else if (bScore === 6 && [6, 7].includes(p3v)) bHand.push(this.fetchRandomCard());
            } else if (bScore <= 5) {
                bHand.push(this.fetchRandomCard());
            }
        }
        bScore = bHand.reduce((sum, c) => sum + c.val, 0) % 10;

        let roundWinner = "T"; 
        if (pScore > bScore) roundWinner = "P";
        else if (bScore > pScore) roundWinner = "B";

        let checkPanda8 = (roundWinner === "P" && pScore === 8 && pHand.length === 3);

        // Process Financial Outputs with 5% Banker Commission
        let totalWinnings = 0;
        if (roundWinner === "P") totalWinnings += wagers.PLAYER * 2;
        if (roundWinner === "T") totalWinnings += wagers.TIE * 9;
        
        if (roundWinner === "B") {
            if (bScore === 6) {
                totalWinnings += wagers.BANKER * 1.5; 
                if (wagers.SUPER6 > 0) totalWinnings += wagers.SUPER6 * ((bHand.length === 2 ? 12 : 20) + 1);
            } else {
                totalWinnings += wagers.BANKER * 1.95; // 5% Banker Commission deducted (Pays 0.95 to 1 net profit)
            }
        }
        
        if (hasPPair) totalWinnings += wagers.P_PAIR * 12;
        if (hasBPair) totalWinnings += wagers.B_PAIR * 12;
        if (checkPanda8) totalWinnings += wagers.PANDA8 * 26; 

        return {
            pHand, bHand, pScore, bScore, roundWinner, checkPanda8, totalWinnings,
            hasPPair, hasBPair, shoeFinished: (this.roundCounter >= 60)
        };
    }
}
