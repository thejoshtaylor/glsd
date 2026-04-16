package cmd

import (
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "glsd",
	Short: "GLSD daemon — supervise Claude Code from the cloud",
	Long:  "The GLSD daemon connects your local machine to glsd.jtlabs.co so you can supervise Claude Code from any browser.",
}

// Execute is the entry point called by main.
func Execute() error {
	return rootCmd.Execute()
}
