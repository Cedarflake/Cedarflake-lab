export type ContractViolationCode =
  | "WORKBENCH_AUDIT_ARGUMENTS_INVALID"
  | "WORKBENCH_AUDIT_DUPLICATE"
  | "WORKBENCH_AUDIT_MISSING"
  | "WORKBENCH_AUDIT_STALE"
  | "WORKBENCH_MANIFEST_INVALID"
  | "WORKBENCH_TEST_DEPENDENCIES_MISSING"
  | "WORKBENCH_TEST_DUPLICATE"
  | "WORKBENCH_TEST_MISSING"
  | "WORKBENCH_TEST_STALE"
  | "WORKBENCH_UV_LOCK_ORPHANED"
  | "WORKFLOW_ACTION_REF_MUTABLE"
  | "WORKFLOW_CHECKOUT_CREDENTIALS_PERSISTED"
  | "WORKFLOW_FILENAME_INVALID"
  | "WORKFLOW_NAME_PREFIX_INVALID"
  | "WORKFLOW_SCHEMA_INVALID"
  | "WORKFLOW_SELF_PATH_MISSING"

export interface ContractViolation {
  code: ContractViolationCode
  message: string
  path: string
}

export interface WorkbenchContractSummary {
  auditEntryCount: number
  dependencyProjectCount: number
  testFileCount: number
  testProjectCount: number
}

export interface WorkflowContractSummary {
  workflowCount: number
}

export interface RepositoryContractSummary
  extends WorkbenchContractSummary, WorkflowContractSummary {}

export interface ContractSectionResult<TSummary> {
  summary: TSummary
  violations: ContractViolation[]
}

export type RepositoryContractResult =
  ContractSectionResult<RepositoryContractSummary>
