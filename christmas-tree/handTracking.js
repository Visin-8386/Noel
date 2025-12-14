// ===== HAND TRACKING MODULE =====
// Uses MediaPipe Hands for gesture recognition

class HandTracker {
    constructor() {
        this.hands = null;
        this.camera = null;
        this.currentGesture = 'none';
        this.handRotation = 0;
        this.handPosition = { x: 0.5, y: 0.5 };
        this.isTracking = false;
        this.landmarks = null;
        this.onGestureChange = null;
        this.gestureHistory = [];
        this.historySize = 5;
    }

    async init(videoElement) {
        return new Promise((resolve, reject) => {
            try {
                this.hands = new Hands({
                    locateFile: (file) => {
                        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
                    }
                });

                this.hands.setOptions({
                    maxNumHands: 1,
                    modelComplexity: 1,
                    minDetectionConfidence: 0.7,
                    minTrackingConfidence: 0.5
                });

                this.hands.onResults((results) => this.onResults(results));

                this.camera = new Camera(videoElement, {
                    onFrame: async () => {
                        await this.hands.send({ image: videoElement });
                    },
                    width: 640,
                    height: 480
                });

                this.camera.start().then(() => {
                    this.isTracking = true;
                    resolve();
                }).catch(reject);

            } catch (error) {
                reject(error);
            }
        });
    }

    onResults(results) {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            this.landmarks = results.multiHandLandmarks[0];
            this.analyzeGesture();
            this.calculateRotation();
            this.calculatePosition();
        } else {
            this.landmarks = null;
            this.updateGesture('none');
        }
    }

    analyzeGesture() {
        if (!this.landmarks) return;

        const gesture = this.detectGesture();
        this.updateGesture(gesture);
    }

    detectGesture() {
        const landmarks = this.landmarks;
        
        // Finger tip and base indices
        const fingerTips = [4, 8, 12, 16, 20]; // thumb, index, middle, ring, pinky
        const fingerBases = [2, 5, 9, 13, 17];
        const fingerMids = [3, 6, 10, 14, 18];

        // Check if fingers are extended
        const fingersExtended = this.getFingersExtended(landmarks);
        
        // Count extended fingers
        const extendedCount = fingersExtended.filter(f => f).length;

        // Detect OK gesture (thumb and index touching, others extended)
        if (this.isOKGesture(landmarks, fingersExtended)) {
            return 'ok';
        }

        // Detect fist (all fingers closed)
        if (extendedCount <= 1) {
            return 'fist';
        }

        // Detect open hand (all fingers extended)
        if (extendedCount >= 4) {
            return 'open';
        }

        return 'none';
    }

    getFingersExtended(landmarks) {
        const extended = [];

        // Thumb: compare x position (for right hand)
        const thumbExtended = landmarks[4].x < landmarks[3].x;
        extended.push(thumbExtended);

        // Other fingers: compare y position (tip should be above base)
        const fingerTips = [8, 12, 16, 20];
        const fingerPips = [6, 10, 14, 18];

        for (let i = 0; i < fingerTips.length; i++) {
            const tipY = landmarks[fingerTips[i]].y;
            const pipY = landmarks[fingerPips[i]].y;
            extended.push(tipY < pipY);
        }

        return extended;
    }

    isOKGesture(landmarks, fingersExtended) {
        // Thumb tip (4) and Index tip (8) should be close together
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        
        const distance = Math.sqrt(
            Math.pow(thumbTip.x - indexTip.x, 2) +
            Math.pow(thumbTip.y - indexTip.y, 2)
        );

        // Check if thumb and index are close (forming OK circle)
        const isTouching = distance < 0.08;

        // Check if other fingers are extended
        const otherFingersExtended = fingersExtended[2] && fingersExtended[3] && fingersExtended[4];

        return isTouching && otherFingersExtended;
    }

    calculateRotation() {
        if (!this.landmarks) return;

        // Calculate hand rotation based on wrist and middle finger base
        const wrist = this.landmarks[0];
        const middleBase = this.landmarks[9];

        const angle = Math.atan2(
            middleBase.x - wrist.x,
            middleBase.y - wrist.y
        );

        this.handRotation = angle;
    }

    calculatePosition() {
        if (!this.landmarks) return;

        // Use palm center (average of key points)
        const wrist = this.landmarks[0];
        const middleBase = this.landmarks[9];

        this.handPosition = {
            x: (wrist.x + middleBase.x) / 2,
            y: (wrist.y + middleBase.y) / 2
        };
    }

    updateGesture(gesture) {
        // Add to history for smoothing
        this.gestureHistory.push(gesture);
        if (this.gestureHistory.length > this.historySize) {
            this.gestureHistory.shift();
        }

        // Get most frequent gesture in history
        const gestureCounts = {};
        this.gestureHistory.forEach(g => {
            gestureCounts[g] = (gestureCounts[g] || 0) + 1;
        });

        let maxCount = 0;
        let smoothedGesture = 'none';
        for (const [g, count] of Object.entries(gestureCounts)) {
            if (count > maxCount) {
                maxCount = count;
                smoothedGesture = g;
            }
        }

        if (smoothedGesture !== this.currentGesture) {
            this.currentGesture = smoothedGesture;
            if (this.onGestureChange) {
                this.onGestureChange(smoothedGesture);
            }
        }
    }

    getGesture() {
        return this.currentGesture;
    }

    getRotation() {
        return this.handRotation;
    }

    getPosition() {
        return this.handPosition;
    }

    destroy() {
        if (this.camera) {
            this.camera.stop();
        }
        this.isTracking = false;
    }
}

// Export for use in main.js
window.HandTracker = HandTracker;
