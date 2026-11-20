/**
 * Minimal type surface for snarkjs 0.7.x (the package ships no TypeScript types).
 * Only the APIs this agent uses are declared; shapes verified empirically.
 */
declare module "snarkjs" {
  export interface Groth16Proof {
    /** raw snarkjs proof, exactly as snarkjs.groth16.fullProve returns it */
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  }

  export interface ProofAndSignals {
    proof: Groth16Proof;
    publicSignals: string[];
  }

  /** Witness input values are decimal strings / bigints / numbers keyed by signal name. */
  export type WitnessInput = Record<string, string | number | bigint | (string | number | bigint)[]>;

  export const wtns: {
    calculate(input: WitnessInput, wasmPath: string, wtnsPath: string, logger?: unknown): Promise<void>;
  };

  export const groth16: {
    prove(zkeyPath: string, wtnsPath: string, logger?: unknown): Promise<ProofAndSignals>;
    verify(
      vk: Record<string, unknown>,
      publicSignals: string[],
      proof: Groth16Proof,
      logger?: unknown,
    ): Promise<boolean>;
  };

  export const zKey: {
    /** returns the verification key object (stringified bigints) */
    exportVerificationKey(zkeyPath: string, logger?: unknown): Promise<Record<string, unknown>>;
  };
}
