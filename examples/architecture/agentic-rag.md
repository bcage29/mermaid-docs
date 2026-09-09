---
title: Agentic RAG Architecture
---

A vendor-neutral reference architecture for retrieval-augmented generation with an
agentic control loop. The orchestrator decides when to search, when to use a tool, and
when enough evidence exists to answer. Retrieval grounds the response in trusted source
documents, while guardrails and evaluation keep the system observable.

## ask - The user asks a question

The chat application sends the user's question and conversation context to the agent API.
The API provides a stable boundary for authentication, request limits, streaming, and
versioning without coupling the client to a particular agent framework.

## plan - The orchestrator chooses the next action

The orchestrator asks the language model to interpret the goal and produce the next step.
It can retrieve evidence, invoke a controlled tool, refine its plan, or prepare the final
answer. Guardrails inspect untrusted input and proposed output around that loop.

## retrieve - The retrieval agent grounds the plan

When current knowledge is needed, the orchestrator delegates a focused query to the
retrieval agent. The agent searches a vector index built from approved source documents
and returns the most relevant passages with their source references.

The orchestrator can repeat retrieval with a refined query when the first result is weak.

## act - Tools provide live capabilities

Some questions require current data or an operation that documents cannot provide. The
orchestrator calls a narrow tool through the tool gateway, which validates arguments and
controls access to external systems. Tool results return to the planning loop as evidence;
the model never receives unrestricted system access.

## answer - The grounded response returns

The orchestrator combines the useful evidence into a concise answer with citations and
streams it through the agent API. Traces capture planning decisions, retrieval quality,
tool calls, latency, and user feedback so the complete RAG loop can be evaluated and
improved.