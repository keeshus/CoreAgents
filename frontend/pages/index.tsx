import Link from 'next/link';
import { ArrowRight, Cpu, Server } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center px-4">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-4">
          Core Agents
        </h1>
        <p className="text-xl md:text-2xl text-zinc-400 font-medium mb-8">
          Visual LLM Agent Builder
        </p>
        <p className="text-base md:text-lg text-zinc-500 max-w-lg mx-auto leading-relaxed mb-10">
          Design, compose, and deploy intelligent LLM agents with a visual
          canvas. Wire together tools, prompts, and models into reusable
          agent workflows without writing boilerplate code.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/flows" className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
            Open Builder <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/settings" className="flex items-center gap-2 px-6 py-3 bg-zinc-700 text-zinc-200 rounded-lg hover:bg-zinc-600 transition-colors font-medium">
            Settings <Server className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
