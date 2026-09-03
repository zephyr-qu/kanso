package service

import "context"

// Capability is the small, stable interface used by HTTP adapters to ask for
// an authorization decision. Resource ownership remains in the domain
// services; this module centralizes role policy and keeps it out of handlers.
type Capability string

const (
	CapabilityEditContent     Capability = "edit_content"
	CapabilityManageStructure Capability = "manage_structure"
	CapabilityDeleteData      Capability = "delete_data"
	CapabilityManageMembers   Capability = "manage_members"
	CapabilityManageSecurity  Capability = "manage_security"
	CapabilityManageRoles     Capability = "manage_roles"
	CapabilityManageSettings  Capability = "manage_settings"
)

// RequireCapability applies global instance role policy. Workspace access is
// checked separately through WorkspaceAdmission at the resource seam.
func (s *Service) RequireCapability(ctx context.Context, memberID string, capability Capability) error {
	role, ok := MemberRoleFromContext(ctx)
	if !ok {
		var err error
		err = s.db.QueryRowContext(ctx, `SELECT role FROM member WHERE id = ?`, memberID).Scan(&role)
		if err != nil {
			return mapNoRows(err)
		}
	}
	if role == memberRoleAdmin {
		return nil
	}
	if capability == CapabilityEditContent {
		return nil
	}
	return ErrForbidden
}
