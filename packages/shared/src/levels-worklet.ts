/**
 * Served as `/worklets/levels.js` for the macOS app's bars. Each band is scaled by its own decaying peak so quiet and
 * loud songs both fill them; posted every ~66 ms from the audio thread, which no page throttling slows.
 */
export const LEVELS_WORKLET_SOURCE = `registerProcessor("keep-levels", class extends AudioWorkletProcessor {
        constructor() {
          super();
          // Every second sample: plenty for band energies, half the work. The filters run at that halved rate.
          this.rate = sampleRate / 2;
          this.a = [250, 1000, 4000].map((f) => Math.exp((-2 * Math.PI * f) / this.rate));
          this.lp = [0, 0, 0]; this.sum = [0, 0, 0, 0]; this.peak = [0.02, 0.02, 0.02, 0.02];
          this.n = 0; this.every = Math.round(this.rate * 0.066);
        }
        process(inputs) {
          const channel = inputs[0] && inputs[0][0];
          if (!channel) return true;
          const { a, lp, sum } = this;
          for (let k = 0; k < channel.length; k += 2) {
            const x = channel[k];
            for (let i = 0; i < 3; i++) lp[i] = (1 - a[i]) * x + a[i] * lp[i];
            const b0 = lp[0], b1 = lp[1] - lp[0], b2 = lp[2] - lp[1], b3 = x - lp[2];
            sum[0] += b0 * b0; sum[1] += b1 * b1; sum[2] += b2 * b2; sum[3] += b3 * b3;
            if (++this.n >= this.every) {
              const levels = sum.map((s, i) => {
                const rms = Math.sqrt(s / this.n);
                this.peak[i] = Math.max(rms, this.peak[i] * 0.985, 0.02);
                return Math.round((rms / this.peak[i]) * 100) / 100;
              });
              this.port.postMessage(levels);
              sum.fill(0); this.n = 0;
            }
          }
          return true;
        }
      });`;
