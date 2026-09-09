package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"text/tabwriter"
)

func printJSON(w io.Writer, v any) error {
	if w == nil {
		w = os.Stdout
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

func printRawJSON(w io.Writer, raw []byte) error {
	if w == nil {
		w = os.Stdout
	}
	var pretty any
	if err := json.Unmarshal(raw, &pretty); err != nil {
		_, err = w.Write(append(raw, '\n'))
		return err
	}
	return printJSON(w, pretty)
}

func printTable(w io.Writer, headers []string, rows [][]string) error {
	if w == nil {
		w = os.Stdout
	}
	tw := tabwriter.NewWriter(w, 0, 4, 2, ' ', 0)
	fmt.Fprintln(tw, strings.Join(headers, "\t"))
	for _, row := range rows {
		fmt.Fprintln(tw, strings.Join(row, "\t"))
	}
	return tw.Flush()
}

func writeLine(w io.Writer, format string, args ...any) {
	if w == nil {
		w = os.Stdout
	}
	fmt.Fprintf(w, format+"\n", args...)
}
