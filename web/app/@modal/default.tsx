// Default content for the `@modal` parallel route slot. Renders nothing
// when no intercepting modal is active — required by Next so navigating
// to non-modal routes doesn't 404 on the modal slot.
export default function DefaultModal(): null {
  return null
}
