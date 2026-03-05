'use client'

import { motion } from 'framer-motion'

type SpecGroup = {
  group: string
  rows: Array<{ label: string; value: string }>
}

type ProductTechSpecsProps = {
  specGroups: SpecGroup[]
}

export function ProductTechSpecs({ specGroups }: ProductTechSpecsProps) {
  return (
    <section className="border-t border-white/5 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="font-heading text-3xl font-semibold text-white sm:text-4xl"
        >
          Tech Specs
        </motion.h2>

        <div className="mt-8 space-y-5">
          {specGroups.map((specGroup, i) => (
            <motion.article
              key={specGroup.group}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="overflow-hidden rounded-xl border border-white/10 bg-navy-800/60"
            >
              <h3 className="font-heading border-b border-white/10 px-5 py-4 text-lg font-semibold text-white">
                {specGroup.group}
              </h3>
              <div>
                {specGroup.rows.map((row) => (
                  <div
                    key={`${specGroup.group}-${row.label}`}
                    className="grid gap-2 border-b border-white/5 px-5 py-3 text-sm last:border-b-0 sm:grid-cols-[200px_1fr] sm:items-start"
                  >
                    <p className="text-white/40">{row.label}</p>
                    <p className="text-white/70">{row.value}</p>
                  </div>
                ))}
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}
