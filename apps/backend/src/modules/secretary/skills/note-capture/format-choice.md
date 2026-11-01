# Choosing a format

The same topic can belong in different formats. Infer intended use from the request
and evidence; these examples are contrasts, not required schemas or tool recipes.

| Request and context                                                                   | Useful outcome                                                                                                        |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| "Buat catatan pengeluaran; tadi beli bahan 42000."                                    | Reuse a suitable expense record table or create one and add the entry. The user need not say "spreadsheet".           |
| "Tulis di jurnal hari ini: aku senang akhirnya bisa mengurangi belanja."              | A daily reflection, preserving the narrative. Do not turn a reflection into a transaction.                            |
| "Buat catatan biasa berisi penjelasan rencana pengeluaran bulan depan, jangan tabel." | A regular rich-text planning note. Explicit prose intent overrides the numeric topic.                                 |
| "Catat suhu ruang pagi ini 24 C."                                                     | A comparable measurement can start/reuse a record table; "pagi ini" is its observation time, not a diary destination. |
| "Buat catatan panduan mengukur suhu ruangan."                                         | Regular reference prose, not a measurement row.                                                                       |
| "Masukkan pengeluaran 42000 ini ke catatan harian hari ini."                          | Honor the explicit daily destination, even though a record table could otherwise fit.                                 |

Reuse a matching maintained home when its schema/context suits the owner's request.
Inspect it as needed; similarly named notes may have different purposes. When only
older daily captures exist, a request to create a maintained collection can create a
record table. Preserve the old captures; do not copy historical amounts into the new
table or total them twice without an explicit scope for that work.

A follow-up addition should reuse the selected collection when context is clear.
Corrections should address the known record, not append a second event. Ask when
ambiguity would materially change the destination or meaning; do not ask users to
choose an internal format when their intended use already provides a clear answer.

Keep all supplied facts and uncertainty. A missing merchant/category/description
is not a reason to invent values or fall back to a diary. Use the owner's/source
time context for dates, and supported context for units. A plan or hypothetical is
not an occurred event. If the user only asks a question, no write is required.
