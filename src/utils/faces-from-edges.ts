export function facesFromEdges(edges: number[][]): number[][] {
  const chains = joinEdges(edges).filter(validFace);
  return chains.map((chain) => chain.map((edge) => edge[0]));
}

function joinEdges(edges: number[][]): number[][][] {
  let changes = true;
  let chains = edges.map(edge => [edge]);
  
  while (changes) {
    changes = connectChains(chains);
    // Filter out undefined chains after each connection attempt
    chains = chains.filter((chain): chain is number[][] => chain !== undefined);
  }
  
  return chains.filter(chain => chain.length > 0);
}

function connectChains(chains: number[][][]): boolean {
  for (let i = 0; i < chains.length; i++) {
    if (!chains[i]) continue; // Skip if chain was deleted
    
    for (let j = 0; j < chains.length; j++) {
      if (i === j || !chains[j]) continue; // Skip if same chain or if chain was deleted
      
      const merged = mergeChains(chains[i], chains[j]);
      if (merged) {
        chains[j] = undefined!;
        return true;
      }
    }
  }
  return false;
}

function mergeChains(chainA: number[][], chainB: number[][]): boolean {
  if (!chainA || !chainB || chainA === chainB) return false;

  if (chainStart(chainA) === chainEnd(chainB)) {
    chainA.unshift(...chainB);
    return true;
  }

  if (chainStart(chainA) === chainStart(chainB)) {
    reverseChain(chainB);
    chainA.unshift(...chainB);
    return true;
  }

  if (chainEnd(chainA) === chainStart(chainB)) {
    chainA.push(...chainB);
    return true;
  }

  if (chainEnd(chainA) === chainEnd(chainB)) {
    reverseChain(chainB);
    chainA.push(...chainB);
    return true;
  }

  return false;
}

function chainStart(chain: number[][]): number {
  if (!chain || chain.length === 0) return -1;
  return chain[0][0];
}

function chainEnd(chain: number[][]): number {
  if (!chain || chain.length === 0) return -1;
  return chain[chain.length - 1][1];
}

function reverseChain(chain: number[][]): void {
  if (!chain) return;
  chain.reverse();
  chain.forEach(edge => edge.reverse());
}

function validFace(chain: number[][]): boolean {
  if (!chain || chain.length === 0) return false;
  return chainStart(chain) === chainEnd(chain);
}